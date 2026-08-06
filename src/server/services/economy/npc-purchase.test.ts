/** Integration tests for the atomic NPC purchase flow. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { purchaseFromNpcShop } from "./npc-shop";
import { enforceRateLimit } from "./rate-limit";
import { EconomyError } from "./errors";
import { fixturePrefix, testDb } from "../test-db";

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
  expect((error as EconomyError).code).toBe(code);
}

describe.skipIf(!testDb)("purchaseFromNpcShop (integration)", () => {
  const db = testDb as PrismaClient;
  let buyerId: string;
  let poorBuyerId: string;
  let shopId: string;
  let restockId: string;
  let itemId: string;
  let instancedItemId: string;

  async function makeStock(
    quantity: number,
    price = 10,
    targetItemId = itemId,
  ): Promise<string> {
    const stock = await db.npcShopStock.create({
      data: {
        shopId,
        itemId: targetItemId,
        restockId,
        price,
        quantity,
        initialQuantity: quantity,
        status: "ACTIVE",
      },
    });
    return stock.id;
  }

  beforeAll(async () => {
    buyerId = (
      await db.user.create({
        data: { username: `${prefix}_buyer`, passwordHash: "x", coins: 10_000 },
      })
    ).id;
    poorBuyerId = (
      await db.user.create({
        data: { username: `${prefix}_poor`, passwordHash: "x", coins: 5 },
      })
    ).id;

    const region = await db.region.create({
      data: { slug: `${prefix}-r`, name: "R", description: "", artKey: "r" },
    });
    const location = await db.location.create({
      data: {
        slug: `${prefix}-l`,
        regionId: region.id,
        name: "L",
        description: "",
        artKey: "l",
      },
    });
    const shop = await db.npcShop.create({
      data: {
        locationId: location.id,
        slug: `${prefix}-shop`,
        name: "Fixture Shop",
        description: "",
      },
    });
    shopId = shop.id;
    // No restock config: the lazy fallback is a no-op, so stock rows placed
    // by the fixture stay exactly as written.
    restockId = (
      await db.shopRestock.create({
        data: {
          shopId,
          windowStart: new Date("2026-08-06T00:00:00Z"),
          seedId: "fixture",
          status: "COMPLETED",
        },
      })
    ).id;

    itemId = (
      await db.item.create({
        data: {
          slug: `${prefix}-snack`,
          name: "Fixture Snack",
          description: "",
          artKey: "s",
          price: 10,
        },
      })
    ).id;
    instancedItemId = (
      await db.item.create({
        data: {
          slug: `${prefix}-relic`,
          name: "Fixture Relic",
          description: "",
          artKey: "r",
          price: 500,
          stackable: false,
          provenancePolicy: "ORIGINAL_SOURCE",
        },
      })
    ).id;
  });

  beforeEach(async () => {
    // Keep rate limits out of the way except in the dedicated test.
    await db.rateLimitWindow.deleteMany({ where: { key: { contains: buyerId } } });
    await db.rateLimitWindow.deleteMany({
      where: { key: { contains: poorBuyerId } },
    });
  });

  afterAll(async () => {
    const userFilter = { username: { startsWith: prefix } };
    await db.transaction.deleteMany({ where: { user: userFilter } });
    await db.securityEvent.deleteMany({ where: { user: userFilter } });
    await db.itemInstance.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await db.npcShopStock.deleteMany({ where: { shopId } });
    await db.shopRestock.deleteMany({ where: { shopId } });
    await db.npcShop.deleteMany({ where: { id: shopId } });
    await db.user.deleteMany({ where: userFilter });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("purchases at the fixed server price: coins, stock, item, ledger", async () => {
    const stockId = await makeStock(5, 10);
    const before = await db.user.findUniqueOrThrow({ where: { id: buyerId } });

    const result = await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 2,
      idempotencyKey: randomUUID(),
    });
    expect(result.totalPrice).toBe(20);

    const after = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(after.coins).toBe(before.coins - 20);

    const stock = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(stock.quantity).toBe(3);
    expect(stock.status).toBe("ACTIVE");

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: buyerId, itemId } },
    });
    expect(entry.quantity).toBeGreaterThanOrEqual(2);

    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId: buyerId, npcStockId: stockId, type: "NPC_PURCHASE" },
    });
    expect(ledger.coinsDelta).toBe(-20);
    expect(ledger.quantity).toBe(2);
    expect(ledger.restockId).toBe(restockId);
  });

  it("grants instances (with provenance) when buying instanced items", async () => {
    const stockId = await makeStock(1, 500, instancedItemId);
    await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    const instance = await db.itemInstance.findFirstOrThrow({
      where: { itemId: instancedItemId, ownerId: buyerId },
    });
    expect(instance.acquisitionSource).toBe(`npc-shop:${prefix}-shop`);
    expect(instance.provenance).toHaveLength(1);
  });

  it("rejects insufficient funds and rolls everything back", async () => {
    const stockId = await makeStock(3, 10);
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: poorBuyerId,
        stockId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "INSUFFICIENT_FUNDS",
    );
    const stock = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(stock.quantity).toBe(3);
    const poor = await db.user.findUniqueOrThrow({ where: { id: poorBuyerId } });
    expect(poor.coins).toBe(5);
  });

  it("rejects unknown, expired, and sold-out stock as unavailable", async () => {
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId: "nonexistent",
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "OUT_OF_STOCK",
    );

    const expiredId = await makeStock(5);
    await db.npcShopStock.update({
      where: { id: expiredId },
      data: { status: "EXPIRED" },
    });
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId: expiredId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "OUT_OF_STOCK",
    );

    const soldOutId = await makeStock(1);
    await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId: soldOutId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId: soldOutId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      "OUT_OF_STOCK",
    );
    // Stale attempts are audit-logged.
    const events = await db.securityEvent.count({
      where: { userId: buyerId, type: "stale-stock-attempt" },
    });
    expect(events).toBeGreaterThan(0);
  });

  it("the final unit disappears from normal queries", async () => {
    const stockId = await makeStock(1);
    await purchaseFromNpcShop(db, {
      userId: buyerId,
      stockId,
      quantity: 1,
      idempotencyKey: randomUUID(),
    });
    const stock = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(stock.status).toBe("SOLD_OUT");
    const visible = await db.npcShopStock.findMany({
      where: { shopId, status: "ACTIVE", quantity: { gt: 0 }, id: stockId },
    });
    expect(visible).toHaveLength(0);
  });

  it("allows exactly one winner for the final unit under concurrency", async () => {
    const stockId = await makeStock(1, 10);
    const results = await Promise.allSettled([
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      purchaseFromNpcShop(db, {
        userId: poorBuyerId,
        stockId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
    ]);
    const wins = results.filter((result) => result.status === "fulfilled");
    expect(wins.length).toBe(1);
    const stock = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(stock.quantity).toBe(0);
  });

  it("concurrent purchases cannot overspend a wallet", async () => {
    const racer = await db.user.create({
      data: { username: `${prefix}_racer`, passwordHash: "x", coins: 25 },
    });
    const stockA = await makeStock(1, 20);
    const stockB = await makeStock(1, 20);
    await Promise.allSettled([
      purchaseFromNpcShop(db, {
        userId: racer.id,
        stockId: stockA,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
      purchaseFromNpcShop(db, {
        userId: racer.id,
        stockId: stockB,
        quantity: 1,
        idempotencyKey: randomUUID(),
      }),
    ]);
    const after = await db.user.findUniqueOrThrow({ where: { id: racer.id } });
    // Only one 20-coin purchase can have succeeded on a 25-coin wallet.
    expect(after.coins).toBe(5);
  });

  it("idempotent retries return the original result without buying twice", async () => {
    const stockId = await makeStock(4, 10);
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
    expect(retry).toEqual(first);
    const stock = await db.npcShopStock.findUniqueOrThrow({ where: { id: stockId } });
    expect(stock.quantity).toBe(3);

    // Reusing the key for a materially different request is rejected.
    await expectEconomyError(
      purchaseFromNpcShop(db, {
        userId: buyerId,
        stockId,
        quantity: 2,
        idempotencyKey: key,
      }),
      "IDEMPOTENCY_KEY_REUSED",
    );
  });

  it("rate limits repeated purchase attempts and records the violation", async () => {
    const limited = await db.user.create({
      data: { username: `${prefix}_limited`, passwordHash: "x", coins: 10 },
    });
    let rateLimited = false;
    for (let i = 0; i < 25; i++) {
      try {
        await enforceRateLimit(db, "npc-purchase", limited.id);
      } catch (error) {
        expect(error).toBeInstanceOf(EconomyError);
        expect((error as EconomyError).code).toBe("RATE_LIMITED");
        rateLimited = true;
        break;
      }
    }
    expect(rateLimited).toBe(true);
    const events = await db.securityEvent.count({
      where: { userId: limited.id, type: "rate-limit-exceeded" },
    });
    expect(events).toBeGreaterThan(0);
  });
});
