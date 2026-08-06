/** Integration tests for player shops: listings, escrow, purchases, proceeds, upgrades. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  cancelListing,
  claimProceeds,
  createListing,
  ensurePlayerShop,
  purchaseCapacityUpgrade,
  purchaseListing,
  updateListingPrice,
} from "./player-shop";
import { grantItem } from "./ownership";
import { EconomyError } from "./errors";
import { BASE_SHOP_CAPACITY } from "./config";
import { fixturePrefix, testDb } from "../test-db";

const prefix = fixturePrefix("pshop");

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

describe.skipIf(!testDb)("player shops (integration)", () => {
  const db = testDb as PrismaClient;
  let sellerId: string;
  let buyerId: string;
  let stackItemId: string;
  let rareInstancedItemId: string;
  let nontradeableItemId: string;

  beforeAll(async () => {
    sellerId = (
      await db.user.create({
        data: { username: `${prefix}_seller`, passwordHash: "x", coins: 50_000 },
      })
    ).id;
    buyerId = (
      await db.user.create({
        data: { username: `${prefix}_buyer`, passwordHash: "x", coins: 50_000 },
      })
    ).id;

    stackItemId = (
      await db.item.create({
        data: {
          slug: `${prefix}-berries`,
          name: "Fixture Berries",
          description: "",
          artKey: "b",
          price: 10,
        },
      })
    ).id;
    rareInstancedItemId = (
      await db.item.create({
        data: {
          slug: `${prefix}-heirloom`,
          name: "Fixture Heirloom",
          description: "",
          artKey: "h",
          price: 900,
          rarity: "RARE",
          stackable: false,
          provenancePolicy: "FULL_HISTORY",
        },
      })
    ).id;
    nontradeableItemId = (
      await db.item.create({
        data: {
          slug: `${prefix}-bound`,
          name: "Fixture Keepsake",
          description: "",
          artKey: "k",
          price: 5,
          tradeable: false,
        },
      })
    ).id;

    await db.playerShopUpgradeTier.upsert({
      where: { tier: 1 },
      create: { tier: 1, name: "T1", price: 500, capacityBonus: 4 },
      update: {},
    });
    await db.playerShopUpgradeTier.upsert({
      where: { tier: 2 },
      create: { tier: 2, name: "T2", price: 2000, capacityBonus: 4 },
      update: {},
    });
  });

  beforeEach(async () => {
    // Scoped to this suite's users so parallel suites' limits are untouched.
    const users = await db.user.findMany({
      where: { username: { startsWith: prefix } },
      select: { id: true },
    });
    for (const user of users) {
      await db.rateLimitWindow.deleteMany({
        where: { key: { contains: user.id } },
      });
    }
    await db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({ where: { id: stackItemId } });
      await grantItem(tx, { userId: sellerId, item, quantity: 50, source: "test" });
    });
  });

  afterAll(async () => {
    const userFilter = { username: { startsWith: prefix } };
    await db.transaction.deleteMany({ where: { user: userFilter } });
    await db.securityEvent.deleteMany({ where: { user: userFilter } });
    await db.playerShopListing.deleteMany({
      where: { seller: userFilter },
    });
    await db.itemInstance.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await db.playerShopUpgradePurchase.deleteMany({
      where: { shop: { owner: userFilter } },
    });
    await db.playerShop.deleteMany({ where: { owner: userFilter } });
    await db.user.deleteMany({ where: userFilter });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("creates the shop lazily with base capacity and a public slug", async () => {
    const shop = await ensurePlayerShop(db, sellerId);
    expect(shop.listingCapacity).toBe(BASE_SHOP_CAPACITY);
    expect(shop.slug).toBe(`${prefix}_seller`.toLowerCase());
    const again = await ensurePlayerShop(db, sellerId);
    expect(again.id).toBe(shop.id);
  });

  it("lists a partial stack into escrow: inventory drops, listing holds it", async () => {
    const before = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    const result = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 10,
      unitPrice: 25,
      idempotencyKey: randomUUID(),
    });
    const after = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    expect(after.quantity).toBe(before.quantity - 10);

    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: result.listingId },
    });
    expect(listing.status).toBe("ACTIVE");
    expect(listing.quantity).toBe(10);

    // Cannot list more than remains after escrow.
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: stackItemId,
        quantity: after.quantity + 1,
        unitPrice: 5,
        idempotencyKey: randomUUID(),
      }),
      "INSUFFICIENT_ITEMS",
    );
  });

  it("idempotent create: retrying the same key yields one listing", async () => {
    const key = randomUUID();
    const first = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 2,
      unitPrice: 7,
      idempotencyKey: key,
    });
    const retry = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 2,
      unitPrice: 7,
      idempotencyKey: key,
    });
    expect(retry.listingId).toBe(first.listingId);
    const count = await db.playerShopListing.count({
      where: { sellerId, itemId: stackItemId, unitPrice: 7, status: "ACTIVE" },
    });
    expect(count).toBe(1);
  });

  it("rejects nontradeable items", async () => {
    await db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({
        where: { id: nontradeableItemId },
      });
      await grantItem(tx, { userId: sellerId, item, quantity: 1, source: "test" });
    });
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: nontradeableItemId,
        quantity: 1,
        unitPrice: 10,
        idempotencyKey: randomUUID(),
      }),
      "NOT_TRADEABLE",
    );
  });

  it("updates price while active; cancellation returns escrow atomically", async () => {
    const created = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 5,
      unitPrice: 30,
      idempotencyKey: randomUUID(),
    });
    await updateListingPrice(db, {
      userId: sellerId,
      listingId: created.listingId,
      unitPrice: 42,
    });
    const updated = await db.playerShopListing.findUniqueOrThrow({
      where: { id: created.listingId },
    });
    expect(updated.unitPrice).toBe(42);

    const before = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    await cancelListing(db, {
      userId: sellerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    const after = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: sellerId, itemId: stackItemId } },
    });
    expect(after.quantity).toBe(before.quantity + 5);
    const cancelled = await db.playerShopListing.findUniqueOrThrow({
      where: { id: created.listingId },
    });
    expect(cancelled.status).toBe("CANCELLED");

    // Price updates on non-active listings are rejected.
    await expectEconomyError(
      updateListingPrice(db, {
        userId: sellerId,
        listingId: created.listingId,
        unitPrice: 50,
      }),
      "LISTING_NOT_ACTIVE",
    );
  });

  it("full sale lifecycle: no fee, escrow transfer, proceeds to till, single claim", async () => {
    const created = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 4,
      unitPrice: 100,
      idempotencyKey: randomUUID(),
    });

    // Self-purchase is rejected.
    await expectEconomyError(
      purchaseListing(db, {
        buyerId: sellerId,
        listingId: created.listingId,
        idempotencyKey: randomUUID(),
      }),
      "SELF_PURCHASE",
    );

    const buyerBefore = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    const sellerBefore = await db.user.findUniqueOrThrow({ where: { id: sellerId } });

    const sale = await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    expect(sale.totalPrice).toBe(400);

    // Buyer paid exactly the listing total; no fees or tax anywhere.
    const buyerAfter = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(buyerAfter.coins).toBe(buyerBefore.coins - 400);
    const buyerStack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId: buyerId, itemId: stackItemId } },
    });
    expect(buyerStack.quantity).toBeGreaterThanOrEqual(4);

    // Proceeds accumulate in the till, not the wallet.
    const sellerAfter = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(sellerAfter.coins).toBe(sellerBefore.coins);
    const shop = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    expect(shop.unclaimedProceeds).toBeGreaterThanOrEqual(400);
    expect(shop.lifetimeRevenue).toBeGreaterThanOrEqual(400);

    // Ledger identifies both parties.
    const buyerLedger = await db.transaction.findFirstOrThrow({
      where: { userId: buyerId, playerListingId: created.listingId },
    });
    expect(buyerLedger.counterpartyUserId).toBe(sellerId);
    const sellerLedger = await db.transaction.findFirstOrThrow({
      where: { userId: sellerId, playerListingId: created.listingId, type: "PLAYER_SALE" },
    });
    expect(sellerLedger.counterpartyUserId).toBe(buyerId);

    // Claim moves the till to the wallet, exactly once.
    const tillAmount = shop.unclaimedProceeds;
    const claim = await claimProceeds(db, {
      userId: sellerId,
      idempotencyKey: randomUUID(),
    });
    expect(claim.claimed).toBe(tillAmount);
    const sellerClaimed = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(sellerClaimed.coins).toBe(sellerBefore.coins + tillAmount);
    await expectEconomyError(
      claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
      "NOTHING_TO_CLAIM",
    );
  });

  it("concurrent buyers: exactly one wins the listing", async () => {
    const rival = await db.user.create({
      data: { username: `${prefix}_rival`, passwordHash: "x", coins: 10_000 },
    });
    const created = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 60,
      idempotencyKey: randomUUID(),
    });
    const results = await Promise.allSettled([
      purchaseListing(db, {
        buyerId,
        listingId: created.listingId,
        idempotencyKey: randomUUID(),
      }),
      purchaseListing(db, {
        buyerId: rival.id,
        listingId: created.listingId,
        idempotencyKey: randomUUID(),
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: created.listingId },
    });
    expect(listing.status).toBe("SOLD");
  });

  it("concurrent claims credit the till exactly once", async () => {
    const created = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 90,
      idempotencyKey: randomUUID(),
    });
    await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    const before = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    const shop = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    const till = shop.unclaimedProceeds;
    expect(till).toBeGreaterThan(0);

    const results = await Promise.allSettled([
      claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
      claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
      claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(after.coins).toBe(before.coins + till);
  });

  it("instances: escrow on listing, resale by the buyer, provenance intact", async () => {
    const instanceId = await db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({
        where: { id: rareInstancedItemId },
      });
      const granted = await grantItem(tx, {
        userId: sellerId,
        item,
        quantity: 1,
        source: "npc-shop:test",
      });
      return granted.instanceIds[0] as string;
    });

    const created = await createListing(db, {
      userId: sellerId,
      itemId: rareInstancedItemId,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 1500,
      idempotencyKey: randomUUID(),
    });
    const escrowed = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(escrowed.status).toBe("ESCROWED");

    // The escrowed instance cannot be listed again.
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: rareInstancedItemId,
        itemInstanceId: instanceId,
        quantity: 1,
        unitPrice: 1,
        idempotencyKey: randomUUID(),
      }),
      "INSTANCE_NOT_OWNED",
    );

    await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    const transferred = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(transferred.ownerId).toBe(buyerId);
    expect(transferred.status).toBe("OWNED");

    // Rare items remain resellable: the buyer lists it again.
    const resale = await createListing(db, {
      userId: buyerId,
      itemId: rareInstancedItemId,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 2000,
      idempotencyKey: randomUUID(),
    });
    expect(resale.listingId).not.toBe(created.listingId);
    const events = (
      await db.itemInstance.findUniqueOrThrow({ where: { id: instanceId } })
    ).provenance as Array<{ type: string }>;
    expect(events.map((event) => event.type)).toEqual([
      "acquired",
      "transferred",
    ]);
  });

  it("enforces capacity and expands it via idempotent tiered upgrades", async () => {
    const fresh = await db.user.create({
      data: { username: `${prefix}_cap`, passwordHash: "x", coins: 10_000 },
    });
    await db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({ where: { id: stackItemId } });
      await grantItem(tx, { userId: fresh.id, item, quantity: 100, source: "test" });
    });
    const shop = await ensurePlayerShop(db, fresh.id);

    for (let i = 0; i < shop.listingCapacity; i++) {
      await createListing(db, {
        userId: fresh.id,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 10 + i,
        idempotencyKey: randomUUID(),
      });
    }
    await expectEconomyError(
      createListing(db, {
        userId: fresh.id,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 999,
        idempotencyKey: randomUUID(),
      }),
      "CAPACITY_FULL",
    );

    // Skipping a tier is rejected; buying in order works and is permanent.
    await expectEconomyError(
      purchaseCapacityUpgrade(db, {
        userId: fresh.id,
        tier: 2,
        idempotencyKey: randomUUID(),
      }),
      "UPGRADE_PREREQUISITE_MISSING",
    );
    const before = await db.user.findUniqueOrThrow({ where: { id: fresh.id } });
    const key = randomUUID();
    const upgrade = await purchaseCapacityUpgrade(db, {
      userId: fresh.id,
      tier: 1,
      idempotencyKey: key,
    });
    expect(upgrade.newCapacity).toBe(shop.listingCapacity + 4);
    const retried = await purchaseCapacityUpgrade(db, {
      userId: fresh.id,
      tier: 1,
      idempotencyKey: key,
    });
    expect(retried).toEqual(upgrade);
    const after = await db.user.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(after.coins).toBe(before.coins - 500);

    await expectEconomyError(
      purchaseCapacityUpgrade(db, {
        userId: fresh.id,
        tier: 1,
        idempotencyKey: randomUUID(),
      }),
      "UPGRADE_ALREADY_OWNED",
    );

    // The freed capacity is immediately usable.
    await createListing(db, {
      userId: fresh.id,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 1000,
      idempotencyKey: randomUUID(),
    });
  });

  it("accepts very high prices bounded only by safe integer limits", async () => {
    const result = await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity: 1,
      unitPrice: 1_000_000_000,
      idempotencyKey: randomUUID(),
    });
    expect(result.unitPrice).toBe(1_000_000_000);
    await expectEconomyError(
      createListing(db, {
        userId: sellerId,
        itemId: stackItemId,
        quantity: 1,
        unitPrice: 1_000_000_001,
        idempotencyKey: randomUUID(),
      }),
      "INVALID_PRICE",
    );
  });
});
