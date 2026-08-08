/** Player-shop purchases, eligibility policy, proceeds, and upgrades. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { ensurePlayerShop } from "./commands/shop";
import { createListing, updateListingPrice } from "./commands/listings";
import { purchaseListing } from "./commands/purchase";
import { marketCommission } from "./commission";
import { claimProceeds } from "./commands/proceeds";
import { purchaseCapacityUpgrade } from "./commands/upgrades";
import { getPublicShop, listingsForItem } from "./queries";
import { runReconciliation } from "@/server/modules/admin/reconciliation";
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

  it("full sale lifecycle: cut taken, proceeds to till, exactly-once claim", async () => {
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

    // Taking the whole listing is now a choice like any other quantity.
    const { result: sale } = await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      quantity: 4,
      idempotencyKey: randomUUID(),
    });
    expect(sale.totalPrice).toBe("400");
    expect(sale.remaining).toBe(0);

    // The buyer pays the sticker price. The market's cut comes out of the
    // seller's side, so a listed price is never a lie to the person
    // paying it (ADR-55).
    const buyerAfter = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(buyerAfter.coins).toBe(buyerBefore.coins - 400n);
    const sellerAfter = await db.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(sellerAfter.coins).toBe(sellerBefore.coins);

    const shop = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    const cut = marketCommission(400n);
    expect(cut).toBeGreaterThan(0n);
    expect(sale.commission).toBe(cut.toString());
    expect(shop.unclaimedProceeds).toBe(400n - cut);
    // Revenue stays gross so it keeps agreeing with the buyer's row.
    expect(shop.lifetimeRevenue).toBe(400n);
    expect(shop.lifetimeCommission).toBe(cut);

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

  /**
   * The sink itself: coins that leave the world rather than moving to
   * another wallet. Nothing anywhere holds them afterwards, which is the
   * whole point — a treasury of confiscated coins is not a sink.
   */
  it("destroys the market's cut rather than paying it to anyone", async () => {
    const created = await list(4, 100n);
    const buyerBefore = await db.user.findUniqueOrThrow({
      where: { id: buyerId },
    });
    const sellerBefore = await db.user.findUniqueOrThrow({
      where: { id: sellerId },
    });
    const tillBefore = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });

    const { result: sale } = await purchaseListing(db, {
      buyerId,
      listingId: created.listingId,
      quantity: 4,
      idempotencyKey: randomUUID(),
    });
    const cut = BigInt(sale.commission);
    expect(cut).toBe(20n); // 5% of 400

    const buyerAfter = await db.user.findUniqueOrThrow({
      where: { id: buyerId },
    });
    const sellerAfter = await db.user.findUniqueOrThrow({
      where: { id: sellerId },
    });
    const tillAfter = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });

    // Scoped to the two accounts and the one till involved, deliberately:
    // an aggregate over every user in the database is not this test's
    // business and moves whenever another suite creates a fixture.
    expect(buyerAfter.coins).toBe(buyerBefore.coins - 400n);
    expect(sellerAfter.coins).toBe(sellerBefore.coins);
    expect(tillAfter.unclaimedProceeds).toBe(
      tillBefore.unclaimedProceeds + 400n - cut,
    );

    // 400 left the buyer and 380 arrived. The 20 is gone, not relocated:
    // no wallet, no till, and there is nowhere else for it to be.
    const moved =
      buyerAfter.coins -
      buyerBefore.coins +
      (sellerAfter.coins - sellerBefore.coins) +
      (tillAfter.unclaimedProceeds - tillBefore.unclaimedProceeds);
    expect(moved).toBe(-cut);
  });

  it("rounds the cut down, so small trades are untaxed", () => {
    expect(marketCommission(19n)).toBe(0n);
    expect(marketCommission(20n)).toBe(1n);
    expect(marketCommission(0n)).toBe(0n);
    // Nonsense in, zero out — never a negative that a caller would have
    // to discover as a broken invariant later.
    expect(marketCommission(-100n)).toBe(0n);
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

  it("sells part of a listing and leaves the rest on the shelf", async () => {
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 5 });
    const created = await list(5, 20n);
    const listingId = String(created.listingId);
    const buyerBefore = await db.user.findUniqueOrThrow({ where: { id: buyerId } });

    const { result } = await purchaseListing(db, {
      buyerId,
      listingId,
      quantity: 2,
      idempotencyKey: randomUUID(),
    });
    expect(result.quantity).toBe(2);
    expect(result.remaining).toBe(3);
    expect(result.totalPrice).toBe("40");

    // Charged for two, not for five.
    const buyerAfter = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(buyerAfter.coins).toBe(buyerBefore.coins - 40n);

    // Still on offer, still purchasable, with the listed count preserved.
    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    expect(listing.status).toBe("ACTIVE");
    expect(listing.quantity).toBe(3);
    expect(listing.quantityListed).toBe(5);

    // The rest can be bought later, and that empties it.
    const second = await purchaseListing(db, {
      buyerId,
      listingId,
      quantity: 3,
      idempotencyKey: randomUUID(),
    });
    expect(second.result.remaining).toBe(0);
    const closed = await db.playerShopListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    expect(closed.status).toBe("SOLD");
    expect(closed.quantity).toBe(0);

    // Both sales are in the till and both are on the ledger.
    const sales = await db.transaction.findMany({
      where: { playerListingId: listingId, type: "PLAYER_SALE" },
    });
    expect(sales.map((row) => row.quantity).sort()).toEqual([2, 3]);
  });

  it("keeps the books straight when a half-sold listing is repriced", async () => {
    // A partially-sold listing stays ACTIVE, so the seller can still edit
    // its price — which means the listing's current unitPrice is NOT the
    // price the earlier units sold at. Anything reconstructing revenue
    // from the listing row rather than the ledger will disagree with the
    // till the moment that happens.
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 5 });
    const created = await list(5, 10n);
    const listingId = String(created.listingId);

    await purchaseListing(db, {
      buyerId,
      listingId,
      quantity: 2,
      idempotencyKey: randomUUID(),
    });
    const shopAfterSale = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });

    // Reprice the remaining three, well away from the original 10.
    await updateListingPrice(db, {
      userId: sellerId,
      listingId,
      unitPrice: 250n,
        idempotencyKey: randomUUID(),
    });

    // The till and lifetime revenue must not have moved: repricing what is
    // left on the shelf cannot retroactively change what was already sold.
    const shopAfterReprice = await db.playerShop.findUniqueOrThrow({
      where: { ownerId: sellerId },
    });
    expect(shopAfterReprice.unclaimedProceeds).toBe(
      shopAfterSale.unclaimedProceeds,
    );
    expect(shopAfterReprice.lifetimeRevenue).toBe(shopAfterSale.lifetimeRevenue);

    // And the ledger still explains the till exactly.
    const spent = await db.transaction.aggregate({
      where: { type: "PLAYER_PURCHASE", playerListing: { shopId: shopAfterSale.id } },
      _sum: { coinsDelta: true },
    });
    const claimed = await db.transaction.aggregate({
      where: { userId: sellerId, type: "PROCEEDS_CLAIM" },
      _sum: { coinsDelta: true },
    });
    expect(shopAfterReprice.unclaimedProceeds).toBe(
      -(spent._sum.coinsDelta ?? 0n) -
        shopAfterReprice.lifetimeCommission -
        (claimed._sum.coinsDelta ?? 0n),
    );

    // And the reconciliation gate agrees — this is the check that failed
    // in CI. Scoped to the shop-money checks: this suite's fixtures hand
    // out starting coins directly, so the wallet-vs-ledger check has a
    // standing finding here that has nothing to do with repricing.
    const findings = await runReconciliation(db, { userIds: [sellerId] });
    expect(
      findings.filter((f) =>
        ["revenue-mismatch", "till-mismatch", "sale-units-mismatch"].includes(
          f.check,
        ),
      ),
    ).toEqual([]);
  });

  it("refuses more than the listing still holds, and charges nothing", async () => {
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 3 });
    const created = await list(3, 15n);
    const before = await db.user.findUniqueOrThrow({ where: { id: buyerId } });

    await expectEconomyError(
      purchaseListing(db, {
        buyerId,
        listingId: String(created.listingId),
        quantity: 4,
        idempotencyKey: randomUUID(),
      }),
      "NOT_ENOUGH_LISTED",
    );

    const after = await db.user.findUniqueOrThrow({ where: { id: buyerId } });
    expect(after.coins).toBe(before.coins);
    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: String(created.listingId) },
    });
    expect(listing.quantity).toBe(3);
  });

  it("concurrent partial buyers never oversell the shelf", async () => {
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 4 });
    const created = await list(4, 10n);
    const rival = await createTestUser(db, {
      username: `${prefix}_rival2`,
      coins: 10_000n,
    });

    // Three buyers each want three of the four. At most one can be wrong.
    const race = await runConcurrently([
      () =>
        purchaseListing(db, {
          buyerId,
          listingId: String(created.listingId),
          quantity: 3,
          idempotencyKey: randomUUID(),
        }),
      () =>
        purchaseListing(db, {
          buyerId: rival.id,
          listingId: String(created.listingId),
          quantity: 3,
          idempotencyKey: randomUUID(),
        }),
      () =>
        purchaseListing(db, {
          buyerId: rival.id,
          listingId: String(created.listingId),
          quantity: 3,
          idempotencyKey: randomUUID(),
        }),
    ]);
    expect(race.fulfilled).toHaveLength(1);

    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: String(created.listingId) },
    });
    // Exactly one purchase landed: one left, and never below zero.
    expect(listing.quantity).toBe(1);
    const sold = await db.transaction.findMany({
      where: { playerListingId: String(created.listingId), type: "PLAYER_SALE" },
    });
    expect(sold.reduce((sum, row) => sum + row.quantity, 0)).toBe(
      listing.quantityListed - listing.quantity,
    );
  });

  it("replays a retried partial purchase instead of buying twice", async () => {
    await giveStack(db, { userId: sellerId, itemId: stackItemId, quantity: 4 });
    const created = await list(4, 25n);
    const key = randomUUID();
    const first = await purchaseListing(db, {
      buyerId,
      listingId: String(created.listingId),
      quantity: 2,
      idempotencyKey: key,
    });
    const retry = await purchaseListing(db, {
      buyerId,
      listingId: String(created.listingId),
      quantity: 2,
      idempotencyKey: key,
    });
    expect(retry.replayed).toBe(true);
    expect(retry.result).toEqual(first.result);
    const listing = await db.playerShopListing.findUniqueOrThrow({
      where: { id: String(created.listingId) },
    });
    expect(listing.quantity).toBe(2);
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
        idempotencyKey: randomUUID(),
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

    // And the shop's recorded revenue still matches what buyers were
    // actually charged. Read from the ledger, not from the listings: a
    // listing's price is mutable while it is ACTIVE, so the row cannot be
    // used to reconstruct what earlier units sold for.
    const shop = await db.playerShop.findUniqueOrThrow({ where: { id: row.shopId } });
    const spent = await db.transaction.aggregate({
      where: { type: "PLAYER_PURCHASE", playerListing: { shopId: row.shopId } },
      _sum: { coinsDelta: true },
    });
    expect(shop.lifetimeRevenue).toBe(-(spent._sum.coinsDelta ?? 0n));
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
