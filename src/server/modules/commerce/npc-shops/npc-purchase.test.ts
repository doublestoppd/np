/** Integration tests for the atomic NPC purchase flow. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { purchaseFromNpcShop } from "./purchase";
import { EconomyError } from "../errors";
import { enforceCommerceRateLimit } from "../config";
import { DomainError } from "@/server/errors";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import {
  createTestNpcShop,
  cleanupTestNpcShops,
  makeStock,
} from "@test/factories/npc-shops";

const prefix = fixturePrefix("npcbuy");

async function expectEconomyError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(EconomyError);
  expect((error as EconomyError).economyCode).toBe(code);
}

describe.skipIf(!testDb)("purchaseFromNpcShop (integration)", () => {
  const db = testDb as PrismaClient;
  let buyerId: string;
  let poorBuyerId: string;
  let shopId: string;
  let restockId: string;
  let itemId: string;
  let instancedItemId: string;

  const stock = (quantity: number, price = 10n, target = itemId) =>
    makeStock(db, { shopId, restockId, itemId: target, quantity, price });

  beforeAll(async () => {
    buyerId = (
      await createTestUser(db, { username: `${prefix}_buyer`, coins: 10_000n })
    ).id;
    poorBuyerId = (
      await createTestUser(db, { username: `${prefix}_poor`, coins: 5n })
    ).id;
    const fixture = await createTestNpcShop(db, { prefix });
    shopId = fixture.shop.id;
    restockId = fixture.restock.id;
    itemId = (await createTestItem(db, { slug: `${prefix}-snack` })).id;
    instancedItemId = (
      await createTestItem(db, {
        slug: `${prefix}-relic`,
        stackable: false,
        provenancePolicy: "ORIGINAL_SOURCE",
        price: 500n,
      })
    ).id;
  });

  beforeEach(async () => {
    for (const id of [buyerId, poorBuyerId]) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
  });

  afterAll(async () => {
    await cleanupTestNpcShops(db, prefix);
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("purchases at the fixed server price: coins, stock, item, ledger", async () => {
    const stockId = await stock(5, 10n);
    const before = await db.user.findUniqueOrThrow({ where: { id: buyerId } });

    const { result } = await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 2,
      idempotencyKey: randomUUID(),
    });
    expect(result.totalPrice).toBe("20");

    const after = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(after.coins).toBe(before.coins - 20n);

    const row = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(row.quantity).toBe(3);

    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId: buyerId, npcStockId: stockId, type: "NPC_PURCHASE" },
    });
    expect(ledger.coinsDelta).toBe(-20n);
    expect(ledger.restockId).toBe(restockId);
  });

  it("grants instances with provenance linked to the ledger row", async () => {
    const stockId = await stock(1, 500n, instancedItemId);
    await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    const instance = await db.itemInstance.findFirstOrThrow({
      where: { itemId: instancedItemId, ownerId: buyerId },
    });
    const event = await db.itemProvenanceEvent.findFirstOrThrow({
      where: { itemInstanceId: instance.id },
    });
    expect(event.eventType).toBe("created");
    expect(event.transactionId).not.toBeNull();
  });

  it("rejects insufficient funds and rolls everything back", async () => {
    const stockId = await stock(3, 10n);
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: poorBuyerId,
        stockId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "INSUFFICIENT_FUNDS",
    );
    const row = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(row.quantity).toBe(3);
    const poor = await db.user.findUniqueOrThrow({ where: { id: poorBuyerId } });
    expect(poor.coins).toBe(5n);
  });

  it("rejects unknown/expired/sold-out stock, disabled items, and audits stale attempts", async () => {
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId: "nonexistent",
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "OUT_OF_STOCK",
    );

    const expiredId = await stock(5);
    await db.npcShopStock.update({ where: { id: expiredId }, data: { status: "EXPIRED" } });
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId: expiredId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "OUT_OF_STOCK",
    );

    // Lifecycle-disabled items cannot be bought even from live stock.
    const disabledItem = await createTestItem(db, {
      slug: `${prefix}-disabled`,
      lifecycle: "DISABLED",
    });
    const disabledStock = await stock(3, 10n, disabledItem.id);
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId: disabledStock,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "ITEM_INACTIVE",
    );

    const events = await db.securityEvent.count({
      where: { userId: buyerId, type: "stale-stock-attempt" },
    });
    expect(events).toBeGreaterThan(0);
  });

  it("allows exactly one winner for the final unit; no wallet overspend", async () => {
    const finalUnit = await stock(1, 10n);
    const race = await runConcurrently([
      () =>
        purchaseFromNpcShop(db, {
          userId: buyerId,
          stockId: finalUnit,
          quantity: 1,
          idempotencyKey: randomUUID(),
        }),
      () =>
        purchaseFromNpcShop(db, {
          userId: buyerId,
          stockId: finalUnit,
          quantity: 1,
          idempotencyKey: randomUUID(),
        }),
      () =>
        purchaseFromNpcShop(db, {
          userId: buyerId,
          stockId: finalUnit,
          quantity: 1,
          idempotencyKey: randomUUID(),
        }),
    ]);
    expect(race.fulfilled).toHaveLength(1);
    const row = await db.npcShopStock.findUniqueOrThrow({ where: { id: finalUnit } });
    expect(row.quantity).toBe(0);
    expect(row.status).toBe("SOLD_OUT");

    const racer = await createTestUser(db, {
      username: `${prefix}_racer`,
      coins: 25n,
    });
    const stockA = await stock(1, 20n);
    const stockB = await stock(1, 20n);
    await runConcurrently([
      () =>
        purchaseFromNpcShop(db, {
          userId: racer.id,
          stockId: stockA,
          quantity: 1,
          idempotencyKey: randomUUID(),
        }),
      () =>
        purchaseFromNpcShop(db, {
          userId: racer.id,
          stockId: stockB,
          quantity: 1,
          idempotencyKey: randomUUID(),
        }),
    ]);
    const after = await db.user.findUniqueOrThrow({ where: { id: racer.id } });
    expect(after.coins).toBe(5n);
  });

  it("idempotent retries replay; key reuse with different payload is rejected", async () => {
    const stockId = await stock(4, 10n);
    const key = randomUUID();
    const first = await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 1,
      idempotencyKey: key,
    });
    const retry = await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 1,
      idempotencyKey: key,
    });
    // Same result, explicitly marked as a replay so the UI can say so
    // instead of claiming a second purchase happened.
    expect(retry.result).toEqual(first.result);
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    const row = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(row.quantity).toBe(3);

    const reuse = await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 2,
      idempotencyKey: key,
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(reuse).toBeInstanceOf(DomainError);
    expect((reuse as DomainError).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("commerce-disabled buyers cannot purchase", async () => {
    const banned = await createTestUser(db, {
      username: `${prefix}_banned`,
      coins: 1_000n,
      commerceDisabledAt: new Date(),
    });
    const stockId = await stock(2, 10n);
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: banned.id,
        stockId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "COMMERCE_DISABLED",
    );
  });

  it("rate limits repeated attempts and records the violation", async () => {
    const limited = await createTestUser(db, {
      username: `${prefix}_limited`,
      coins: 10n,
    });
    let tripped = false;
    for (let i = 0; i < 25 && !tripped; i++) {
      try {
        await enforceCommerceRateLimit(db, "npc-purchase", limited.id);
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe("RATE_LIMITED");
        tripped = true;
      }
    }
    expect(tripped).toBe(true);
    expect(
      await db.securityEvent.count({
        where: { userId: limited.id, type: "rate-limit-exceeded" },
      }),
    ).toBeGreaterThan(0);
  });
});
