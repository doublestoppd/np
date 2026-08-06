/** Player-shop purchases, eligibility policy, proceeds, and upgrades. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ensurePlayerShop } from "./commands/shop";
import { createListing, updateListingPrice } from "./commands/listings";
import { purchaseListing } from "./commands/purchase";
import { claimProceeds } from "./commands/proceeds";
import { purchaseCapacityUpgrade } from "./commands/upgrades";
import { getPublicShop, listingsForItem } from "./queries";
import { EconomyError } from "../errors";
import { grantItem } from "@/server/modules/items/ownership";
import { listProvenance } from "@/server/modules/items/provenance";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("psale");

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

describe.skipIf(!testDb)("player-shop purchases and proceeds (integration)", () => {
  const db = testDb as PrismaClient;
  let sellerId: string;
  let buyerId: string;
  let stackItemId: string;

  const list = async (quantity: number, unitPrice: bigint) =>
    (await createListing(db, {
      userId: sellerId,
      itemId: stackItemId,
      quantity,
      unitPrice,
      idempotencyKey: randomUUID(),
    })).result;

  beforeAll(async () => {
    sellerId = (
      await createTestUser(db, { username: `${prefix}_seller`, coins: 50_000n })
    ).id;
    buyerId = (
      await createTestUser(db, { username: `${prefix}_buyer`, coins: 50_000n })
    ).id;
    stackItemId = (await createTestItem(db, { slug: `${prefix}-goods` })).id;
    await db.playerShopUpgradeTier.upsert({
      where: { tier: 1 },
      create: { tier: 1, name: "T1", price: 500n, capacityBonus: 4 },
      update: {},
    });
    await db.playerShopUpgradeTier.upsert({
      where: { tier: 2 },
      create: { tier: 2, name: "T2", price: 2000n, capacityBonus: 4 },
      update: {},
    });
  });

  beforeEach(async () => {
    for (const id of [sellerId, buyerId]) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 100 });
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("full sale lifecycle: no fees, proceeds to till, exactly-once claim", async () => {
    const created = await list(4, 100n);

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

    const { result: sale } = await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    expect(sale.totalPrice).toBe("400");

    const buyerAfter = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(buyerAfter.coins).toBe(buyerBefore.coins - 400n);
    const sellerAfter = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(sellerAfter.coins).toBe(sellerBefore.coins);

    const shop = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    expect(shop.unclaimedProceeds).toBeGreaterThanOrEqual(400n);

    const buyerLedger = await db.transaction.findFirstOrThrow({
      where: { userId: buyerId, playerListingId: created.listingId },
    });
    expect(buyerLedger.counterpartyUserId).toBe(sellerId);

    const till = shop.unclaimedProceeds;
    const { result: claim } = await claimProceeds(db, {
      userId: sellerId,
      idempotencyKey: randomUUID(),
    });
    expect(claim.claimed).toBe(till.toString());
    const claimed = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(claimed.coins).toBe(sellerBefore.coins + till);
    await expectEconomyError(
      claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
      "NOTHING_TO_CLAIM",
    );
  });

  it("concurrent buyers get one sale; concurrent claims credit once", async () => {
    const rival = await createTestUser(db, {
      username: `${prefix}_rival`,
      coins: 10_000n,
    });
    const created = await list(1, 60n);
    const race = await runConcurrently([
      () =>
        purchaseListing(db, {
          buyerId,
          listingId: created.listingId,
          idempotencyKey: randomUUID(),
        }),
      () =>
        purchaseListing(db, {
          buyerId: rival.id,
          listingId: created.listingId,
          idempotencyKey: randomUUID(),
        }),
    ]);
    expect(race.fulfilled).toHaveLength(1);

    const before = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    const shop = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    const till = shop.unclaimedProceeds;
    expect(till).toBeGreaterThan(0n);
    const claims = await runConcurrently([
      () => claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
      () => claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
      () => claimProceeds(db, { userId: sellerId, idempotencyKey: randomUUID() }),
    ]);
    expect(claims.fulfilled).toHaveLength(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(after.coins).toBe(before.coins + till);
  });

  it("a reprice landing mid-purchase is refused, never charged at a stale price", async () => {
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 5 });
    const created = await list(2, 100n);
    const listingId = String(created.listingId);
    const buyerBefore = await db.user.findUniqueOrThrow({ where: { id: buyerId } });

    // Simulate the interleaving the guard exists for: the purchase reads
    // the listing, the seller's reprice commits, then the purchase writes.
    // Repricing between read and write must not let the buyer pay the old
    // price while the row records the new one.
    await updateListingPrice(db, {
      userId: sellerId,
      listingId,
      unitPrice: 900n,
    });

    await expectEconomyError(
      purchaseListing(db, {
        buyerId,
        listingId,
        idempotencyKey: randomUUID(),
        // The stale terms this buyer saw.
        expectedUnitPrice: 100n,
      }),
      "CONCURRENT_MODIFICATION",
    );

    // Nothing moved: no charge, no sale, no till credit.
    const buyerAfter = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(buyerAfter.coins).toBe(buyerBefore.coins);
    const row = await db.playerShopListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    expect(row.status).toBe("ACTIVE");
    expect(row.unitPrice).toBe(900n);

    // And the shop's recorded revenue still matches its sold rows.
    const shop = await db.playerShop.findUniqueOrThrow({ where: { id: row.shopId } });
    const sold = await db.playerShopListing.findMany({
      where: { shopId: row.shopId, status: "SOLD" },
      select: { unitPrice: true, quantity: true },
    });
    const soldSum = sold.reduce((sum, s) => sum + s.unitPrice * BigInt(s.quantity), 0n);
    expect(shop.lifetimeRevenue).toBe(soldSum);
  });

  it("centralized eligibility: disabled sellers/items/shops cannot sell, reads agree", async () => {
    const created = await list(1, 30n);

    // Disabled seller: hidden from reads, blocked at purchase.
    await db.user.update({
      where: { id: sellerId },
      data: { commerceDisabledAt: new Date() },
    });
    try {
      const listings = await listingsForItem(db, stackItemId);
      expect(listings.some((l) => l.id === created.listingId)).toBe(false);
      const publicShop = await getPublicShop(db, `${prefix}_seller`.toLowerCase());
      expect(
        publicShop?.listings.some((l) => l.id === created.listingId) ?? false,
      ).toBe(false);
      await expectEconomyError(
        purchaseListing(db, {
          buyerId,
          listingId: created.listingId,
          idempotencyKey: randomUUID(),
        }),
        "SELLER_UNAVAILABLE",
      );
    } finally {
      await db.user.update({
        where: { id: sellerId },
        data: { commerceDisabledAt: null },
      });
    }

    // Disabled item: existing listing is not purchasable.
    await db.item.update({
      where: { id: stackItemId },
      data: { lifecycle: "DISABLED" },
    });
    try {
      await expectEconomyError(
        purchaseListing(db, {
          buyerId,
          listingId: created.listingId,
          idempotencyKey: randomUUID(),
        }),
        "ITEM_INACTIVE",
      );
    } finally {
      await db.item.update({
        where: { id: stackItemId },
        data: { lifecycle: "ACTIVE" },
      });
    }

    // Inactive shop: blocked.
    const shop = await ensurePlayerShop(db, sellerId);
    await db.playerShop.update({ where: { id: shop.id }, data: { active: false } });
    try {
      await expectEconomyError(
        purchaseListing(db, {
          buyerId,
          listingId: created.listingId,
          idempotencyKey: randomUUID(),
        }),
        "SHOP_INACTIVE",
      );
    } finally {
      await db.playerShop.update({ where: { id: shop.id }, data: { active: true } });
    }
  });

  it("instances transfer with ledger-linked provenance and remain resellable", async () => {
    const relic = await createTestItem(db, {
      slug: `${prefix}-relic`,
      stackable: false,
      provenancePolicy: "FULL_HISTORY",
      rarity: "RARE",
    });
    const instanceId = await db.$transaction(async (tx) => {
      const granted = await grantItem(tx, {
        userId: sellerId,
        item: relic,
        quantity: 1,
        reason: "distribution",
        source: "npc-shop:test",
      });
      return granted.instanceIds[0] as string;
    });
    const { result: created } = await createListing(db, {
      userId: sellerId,
      itemId: relic.id,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 1_500n,
      idempotencyKey: randomUUID(),
    });
    await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      idempotencyKey: randomUUID(),
    });
    const transferred = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(transferred.ownerId).toBe(buyerId);
    const { events } = await listProvenance(db, instanceId);
    expect(events[0]?.eventType).toBe("transferred");
    const transferEvent = await db.itemProvenanceEvent.findFirstOrThrow({
      where: { itemInstanceId: instanceId, eventType: "transferred" },
    });
    expect(transferEvent.transactionId).not.toBeNull();

    // Tradeable rare items remain resellable by the buyer.
    const { result: resale } = await createListing(db, {
      userId: buyerId,
      itemId: relic.id,
      itemInstanceId: instanceId,
      quantity: 1,
      unitPrice: 2_000n,
      idempotencyKey: randomUUID(),
    });
    expect(resale.listingId).not.toBe(created.listingId);
  });

  it("tiered upgrades: prerequisites, idempotency, no double purchase", async () => {
    const fresh = await createTestUser(db, {
      username: `${prefix}_upg`,
      coins: 10_000n,
    });
    const shop = await ensurePlayerShop(db, fresh.id);
    await expectEconomyError(
      purchaseCapacityUpgrade(db, {
        userId: fresh.id,
        tier: 2,
        idempotencyKey: randomUUID(),
      }),
      "UPGRADE_PREREQUISITE_MISSING",
    );
    const key = randomUUID();
    const { result: upgrade } = await purchaseCapacityUpgrade(db, {
      userId: fresh.id,
      tier: 1,
      idempotencyKey: key,
    });
    expect(upgrade.newCapacity).toBe(shop.listingCapacity + 4);
    const { result: retry } = await purchaseCapacityUpgrade(db, {
      userId: fresh.id,
      tier: 1,
      idempotencyKey: key,
    });
    expect(retry).toEqual(upgrade);
    await expectEconomyError(
      purchaseCapacityUpgrade(db, {
        userId: fresh.id,
        tier: 1,
        idempotencyKey: randomUUID(),
      }),
      "UPGRADE_ALREADY_OWNED",
    );
    const after = await db.user.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(after.coins).toBe(10_000n - 500n);

    // Concurrent upgrade attempts (distinct keys) cannot double-charge.
    const racer = await createTestUser(db, {
      username: `${prefix}_upgrace`,
      coins: 5_000n,
    });
    await ensurePlayerShop(db, racer.id);
    const race = await runConcurrently([
      () =>
        purchaseCapacityUpgrade(db, {
          userId: racer.id,
          tier: 1,
          idempotencyKey: randomUUID(),
        }),
      () =>
        purchaseCapacityUpgrade(db, {
          userId: racer.id,
          tier: 1,
          idempotencyKey: randomUUID(),
        }),
    ]);
    expect(race.fulfilled).toHaveLength(1);
    const racerAfter = await db.user.findUniqueOrThrow({ where: { id: racer.id } });
    expect(racerAfter.coins).toBe(5_000n - 500n);
  });
});
