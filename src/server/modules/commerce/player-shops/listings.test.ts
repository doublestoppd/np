/** Listing commands: escrow, price updates, cancellation, capacity, policy. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ensurePlayerShop } from "./commands/shop";
import { cancelListing, createListing, updateListingPrice } from "./commands/listings";
import { EconomyError } from "../errors";
import { BASE_SHOP_CAPACITY } from "../config";
import { grantItem } from "@/server/modules/items/ownership";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("plist");

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

describe.skipIf(!testDb)("player-shop listings (integration)", () => {
  const db = testDb as PrismaClient;
  let sellerId: string;
  let stackItemId: string;
  let nontradeableId: string;
  let retiredItemId: string;
  let disabledItemId: string;

  beforeAll(async () => {
    sellerId = (
      await createTestUser(db, { username: `${prefix}_seller`, coins: 50_000n })
    ).id;
    stackItemId = (await createTestItem(db, { slug: `${prefix}-berries` })).id;
    nontradeableId = (
      await createTestItem(db, { slug: `${prefix}-bound`, tradeable: false })
    ).id;
    retiredItemId = (
      await createTestItem(db, { slug: `${prefix}-retired`, lifecycle: "RETIRED" })
    ).id;
    disabledItemId = (
      await createTestItem(db, { slug: `${prefix}-off`, lifecycle: "DISABLED" })
    ).id;
  });

  beforeEach(async () => {
    await db.rateLimitWindow.deleteMany({
      where: { key: { contains: sellerId } },
    });
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 50 });
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("creates the shop lazily with base capacity and a normalized slug", async () => {
    const shop = await ensurePlayerShop(db, sellerId);
    expect(shop.listingCapacity).toBe(BASE_SHOP_CAPACITY);
    expect(shop.slug).toBe(`${prefix}_seller`.toLowerCase());
  });

  it("escrows a partial stack on listing and returns it on cancel", async () => {
    const before = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 10,
      unitPrice: 25n,
      idempotencyKey: randomUUID(),
    });
    const after = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    expect(after.quantity).toBe(before.quantity - 10);

    await updateListingPrice(db, {
      userId: sellerId,
      listingId: created.listingId,
      unitPrice: 42n,
    });
    expect(
      (
        await db.playerShopListing.findUniqueOrThrow({
          where: { id: created.listingId },
        })
      ).unitPrice,
    ).toBe(42n);

    await cancelListing(db, {
      userId: sellerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    const restored = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    expect(restored.quantity).toBe(before.quantity);
    await expectEconomyError(
      updateListingPrice(db, {
        userId: sellerId,
        listingId: created.listingId,
        unitPrice: 50n,
      }),
      "LISTING_NOT_ACTIVE",
    );
  });

  it("idempotent create: retrying the same key yields one listing", async () => {
    const key = randomUUID();
    const { result: first } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 2,
      unitPrice: 7n,
      idempotencyKey: key,
    });
    const { result: retry } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 2,
      unitPrice: 7n,
      idempotencyKey: key,
    });
    expect(retry.listingId).toBe(first.listingId);
  });

  it("enforces item policy: nontradeable and DISABLED rejected, RETIRED allowed", async () => {
    await giveStack(db, { userId: sellerId, itemId: nontradeableId, quantity: 1 });
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: nontradeableId,
        quantity: 1,
        unitPrice: 10n,
        idempotencyKey: randomUUID(),
      }),
      "NOT_TRADEABLE",
    );

    await giveStack(db, { userId: sellerId, itemId: disabledItemId, quantity: 1 });
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: disabledItemId,
        quantity: 1,
        unitPrice: 10n,
        idempotencyKey: randomUUID(),
      }),
      "ITEM_INACTIVE",
    );

    await giveStack(db, { userId: sellerId, itemId: retiredItemId, quantity: 1 });
    const { result: retired } = await createListing(db, {
      userId: sellerId,
      itemId: retiredItemId,
      quantity: 1,
      unitPrice: 10n,
      idempotencyKey: randomUUID(),
    });
    expect(retired.listingId).toBeTruthy();
  });

  it("commerce-disabled sellers cannot create but CAN cancel", async () => {
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 9n,
      idempotencyKey: randomUUID(),
    });
    await db.user.update({
      where: { id: sellerId },
      data: { commerceDisabledAt: new Date() },
    });
    try {
      await expectEconomyError(
        createListing(db, {
          userId: sellerId,
          itemId: stackItemId,
          quantity: 1,
          unitPrice: 9n,
          idempotencyKey: randomUUID(),
        }),
        "COMMERCE_DISABLED",
      );
      // Cancellation (recovering their own goods) remains allowed.
      await cancelListing(db, {
        userId: sellerId,
        listingId: created.listingId,
        idempotencyKey: randomUUID(),
      });
      const listing = await db.playerShopListing.findUniqueOrThrow({
        where: { id: created.listingId },
      });
      expect(listing.status).toBe("CANCELLED");
    } finally {
      await db.user.update({
        where: { id: sellerId },
        data: { commerceDisabledAt: null },
      });
    }
  });

  it("accepts bounded high prices and enforces capacity with upgrades pending", async () => {
    const { result: big } = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 1_000_000_000n,
      idempotencyKey: randomUUID(),
    });
    expect(big.unitPrice).toBe("1000000000");
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 1_000_000_001n,
        idempotencyKey: randomUUID(),
      }),
      "INVALID_PRICE",
    );

    const capped = await createTestUser(db, {
      username: `${prefix}_cap`,
      coins: 10_000n,
    });
    await giveStack(db, { userId: capped.id, itemId: stackItemId, quantity: 100 });
    const shop = await ensurePlayerShop(db, capped.id);
    for (let i = 0; i < shop.listingCapacity; i++) {
      await createListing(db, {
        userId: capped.id,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: BigInt(10 + i),
        idempotencyKey: randomUUID(),
      });
    }
    await expectEconomyError(
      createListing(db, {
        userId: capped.id,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 999n,
        idempotencyKey: randomUUID(),
      }),
      "CAPACITY_FULL",
    );
  });

  it("instance listings escrow the copy and block double-listing", async () => {
    const relic = await createTestItem(db, {
      slug: `${prefix}-relic`,
      stackable: false,
      provenancePolicy: "FULL_HISTORY",
    });
    const instanceId = await db.$transaction(async (tx) => {
      const granted = await grantItem(tx, {
        userId: sellerId,
        item: relic,
        quantity: 1,
        source: "test",
      });
      return granted.instanceIds[0] as string;
    });
    await createListing(db, {
      userId: sellerId,
      itemId: relic.id,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 1_500n,
      idempotencyKey: randomUUID(),
    });
    const escrowed = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(escrowed.status).toBe("ESCROWED");
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: relic.id,
        itemInstanceId: instanceId,
        quantity: 1,
        unitPrice: 1n,
        idempotencyKey: randomUUID(),
      }),
      "INSTANCE_NOT_OWNED",
    );
  });
});
