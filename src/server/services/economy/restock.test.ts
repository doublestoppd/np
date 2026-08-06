/**
 * Restock engine tests: the pure deterministic planner, plus executor
 * idempotency/concurrency/atomic-replacement against a real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  NpcShopRestockConfig,
  PrismaClient,
} from "@prisma/client";
import { Rarity } from "@prisma/client";
import {
  computeWindowStart,
  eligibleEntries,
  executeRestock,
  planRestock,
  type PoolEntryWithItem,
} from "./restock";
import { EconomyError } from "./errors";
import { fixturePrefix, testDb } from "../test-db";

const SECRET = "test-secret";

function makeConfig(
  overrides: Partial<NpcShopRestockConfig> = {},
): NpcShopRestockConfig {
  return {
    id: "cfg",
    shopId: "shop-1",
    intervalHours: 8,
    targetListings: 12,
    commonMin: 7,
    commonMax: 9,
    uncommonMin: 2,
    uncommonMax: 4,
    rareMin: 0,
    rareMax: 2,
    ultraRareBps: 300,
    maxUltraRare: 1,
    enabled: true,
    ...overrides,
  };
}

let poolCounter = 0;

function makeEntry(
  slug: string,
  shopRarity: Rarity,
  {
    weight = 10,
    minQuantity = 1,
    maxQuantity = 5,
    active = true,
    availableFrom = null,
    availableUntil = null,
  }: Partial<{
    weight: number;
    minQuantity: number;
    maxQuantity: number;
    active: boolean;
    availableFrom: Date | null;
    availableUntil: Date | null;
  }> = {},
): PoolEntryWithItem {
  poolCounter++;
  return {
    id: `pool-${poolCounter}`,
    shopId: "shop-1",
    itemId: `item-${slug}`,
    shopRarity,
    price: 10,
    weight,
    minQuantity,
    maxQuantity,
    active,
    availableFrom,
    availableUntil,
    metadata: null,
    item: {
      id: `item-${slug}`,
      slug,
      name: slug,
      description: "",
      type: null,
      artKey: slug,
      price: 10,
      rarity: shopRarity,
      tradeable: true,
      stackable: true,
      provenancePolicy: "NONE",
      active: true,
      releasedAt: null,
      retiredAt: null,
      metadata: null,
      hungerRestore: null,
      happinessBoost: null,
      categoryId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  } as PoolEntryWithItem;
}

function bigPool(): PoolEntryWithItem[] {
  const entries: PoolEntryWithItem[] = [];
  for (let i = 0; i < 12; i++) entries.push(makeEntry(`common-${i}`, Rarity.COMMON));
  for (let i = 0; i < 6; i++) entries.push(makeEntry(`uncommon-${i}`, Rarity.UNCOMMON));
  for (let i = 0; i < 4; i++) entries.push(makeEntry(`rare-${i}`, Rarity.RARE));
  entries.push(makeEntry("ultra-0", Rarity.ULTRA_RARE));
  return entries;
}

const WINDOW = new Date("2026-08-06T08:00:00Z");

describe("computeWindowStart", () => {
  it("aligns windows to UTC interval multiples", () => {
    expect(
      computeWindowStart(8, new Date("2026-08-06T09:30:00Z")).toISOString(),
    ).toBe("2026-08-06T08:00:00.000Z");
    expect(
      computeWindowStart(8, new Date("2026-08-06T07:59:59Z")).toISOString(),
    ).toBe("2026-08-06T00:00:00.000Z");
  });
});

describe("planRestock (pure, deterministic)", () => {
  it("produces identical results for the same shop, window, and secret", () => {
    const config = makeConfig();
    const pool = bigPool();
    const first = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config,
      poolEntries: pool,
      secret: SECRET,
    });
    const second = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config,
      poolEntries: [...pool].reverse(), // row order must not matter
      secret: SECRET,
    });
    expect(second).toEqual(first);
  });

  it("different windows produce independent (and here different) results", () => {
    const config = makeConfig();
    const pool = bigPool();
    const windows = [
      new Date("2026-08-06T00:00:00Z"),
      new Date("2026-08-06T08:00:00Z"),
      new Date("2026-08-06T16:00:00Z"),
      new Date("2026-08-07T00:00:00Z"),
    ];
    const plans = windows.map((windowStart) =>
      planRestock({ shopId: "shop-1", windowStart, config, poolEntries: pool, secret: SECRET }),
    );
    const seedIds = new Set(plans.map((plan) => plan.seedId));
    expect(seedIds.size).toBe(windows.length);
    const signatures = new Set(
      plans.map((plan) =>
        plan.listings.map((listing) => `${listing.itemSlug}:${listing.quantity}`).join(","),
      ),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("selects a composition that exactly matches the configured bounds", () => {
    const config = makeConfig();
    const plan = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config,
      poolEntries: bigPool(),
      secret: SECRET,
    });
    const { common, uncommon, rare, ultraRare } = plan.composition;
    expect(common).toBeGreaterThanOrEqual(config.commonMin);
    expect(common).toBeLessThanOrEqual(config.commonMax);
    expect(uncommon).toBeGreaterThanOrEqual(config.uncommonMin);
    expect(uncommon).toBeLessThanOrEqual(config.uncommonMax);
    expect(rare).toBeGreaterThanOrEqual(config.rareMin);
    expect(rare).toBeLessThanOrEqual(config.rareMax);
    expect(common + uncommon + rare + ultraRare).toBe(config.targetListings);
    expect(plan.listings.length).toBe(config.targetListings);
  });

  it("rejects configurations with no valid composition", () => {
    // target 12 but tiers can only sum to at most 3+1+1 = 5.
    const config = makeConfig({
      commonMin: 1,
      commonMax: 3,
      uncommonMin: 0,
      uncommonMax: 1,
      rareMin: 0,
      rareMax: 1,
    });
    expect(() =>
      planRestock({
        shopId: "shop-1",
        windowStart: WINDOW,
        config,
        poolEntries: bigPool(),
        secret: SECRET,
      }),
    ).toThrowError(EconomyError);
  });

  it("never lists the same item twice", () => {
    const plan = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig(),
      poolEntries: bigPool(),
      secret: SECRET,
    });
    const slugs = plan.listings.map((listing) => listing.itemSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps every quantity within the entry's inclusive bounds", () => {
    const pool = bigPool().map((entry) => ({
      ...entry,
      minQuantity: 3,
      maxQuantity: 7,
    }));
    for (let hour = 0; hour < 10; hour++) {
      const plan = planRestock({
        shopId: "shop-1",
        windowStart: new Date(WINDOW.getTime() + hour * 8 * 3_600_000),
        config: makeConfig(),
        poolEntries: pool,
        secret: SECRET,
      });
      for (const listing of plan.listings) {
        expect(listing.quantity).toBeGreaterThanOrEqual(3);
        expect(listing.quantity).toBeLessThanOrEqual(7);
      }
    }
  });

  it("honors the ultra-rare roll: guaranteed at 100%, capped at one", () => {
    const always = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 10_000 }),
      poolEntries: bigPool(),
      secret: SECRET,
    });
    expect(always.ultraRareSelected).toBe(true);
    expect(
      always.listings.filter((listing) => listing.shopRarity === "ULTRA_RARE"),
    ).toHaveLength(1);

    const never = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 0 }),
      poolEntries: bigPool(),
      secret: SECRET,
    });
    expect(never.ultraRareSelected).toBe(false);
    expect(
      never.listings.filter((listing) => listing.shopRarity === "ULTRA_RARE"),
    ).toHaveLength(0);
  });

  it("has no rarity cooldown: consecutive windows can repeat the ultra-rare", () => {
    const config = makeConfig({ ultraRareBps: 10_000 });
    const pool = bigPool();
    for (const hourOffset of [0, 8, 16]) {
      const plan = planRestock({
        shopId: "shop-1",
        windowStart: new Date(WINDOW.getTime() + hourOffset * 3_600_000),
        config,
        poolEntries: pool,
        secret: SECRET,
      });
      expect(
        plan.listings.some((listing) => listing.itemSlug === "ultra-0"),
      ).toBe(true);
    }
  });

  it("respects explicit date eligibility windows", () => {
    const pool = [
      ...bigPool(),
      makeEntry("expired-limited", Rarity.UNCOMMON, {
        weight: 100_000, // would dominate selection if eligible
        availableUntil: new Date("2026-01-01T00:00:00Z"),
      }),
      makeEntry("future-limited", Rarity.UNCOMMON, {
        weight: 100_000,
        availableFrom: new Date("2030-01-01T00:00:00Z"),
      }),
    ];
    expect(
      eligibleEntries(pool, WINDOW).some(
        (entry) => entry.item.slug === "expired-limited",
      ),
    ).toBe(false);
    const plan = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig(),
      poolEntries: pool,
      secret: SECRET,
    });
    const slugs = plan.listings.map((listing) => listing.itemSlug);
    expect(slugs).not.toContain("expired-limited");
    expect(slugs).not.toContain("future-limited");
  });

  it("backfills only toward lower rarity when a tier pool is short", () => {
    // Guaranteed ultra slot but NO ultra pool: the slot must fall to rare.
    const pool = bigPool().filter((entry) => entry.shopRarity !== "ULTRA_RARE");
    const plan = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 10_000 }),
      poolEntries: pool,
      secret: SECRET,
    });
    expect(plan.backfilled.toRare).toBe(1);
    expect(
      plan.listings.filter((listing) => listing.shopRarity === "ULTRA_RARE"),
    ).toHaveLength(0);
    expect(plan.listings.length).toBe(makeConfig().targetListings);
  });

  it("never promotes lower-rarity slots upward and shrinks safely when short", () => {
    // Only 3 commons exist; composition demands at least 7.
    const pool = [
      makeEntry("common-a", Rarity.COMMON),
      makeEntry("common-b", Rarity.COMMON),
      makeEntry("common-c", Rarity.COMMON),
      makeEntry("uncommon-a", Rarity.UNCOMMON),
      makeEntry("uncommon-b", Rarity.UNCOMMON),
      makeEntry("uncommon-c", Rarity.UNCOMMON),
      makeEntry("uncommon-d", Rarity.UNCOMMON),
      makeEntry("rare-a", Rarity.RARE),
      makeEntry("rare-b", Rarity.RARE),
    ];
    const plan = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 0 }),
      poolEntries: pool,
      secret: SECRET,
    });
    const commons = plan.listings.filter((l) => l.shopRarity === "COMMON").length;
    const uncommons = plan.listings.filter((l) => l.shopRarity === "UNCOMMON").length;
    const rares = plan.listings.filter((l) => l.shopRarity === "RARE").length;
    expect(commons).toBe(3);
    expect(plan.backfilled.unfilled).toBeGreaterThan(0);
    // Higher tiers stay within their configured maxima — no promotion.
    expect(uncommons).toBeLessThanOrEqual(makeConfig().uncommonMax);
    expect(rares).toBeLessThanOrEqual(makeConfig().rareMax);
    expect(plan.listings.length).toBeLessThan(makeConfig().targetListings);
  });
});

const prefix = fixturePrefix("restock");

describe.skipIf(!testDb)("executeRestock (integration)", () => {
  const db = testDb as PrismaClient;
  let shopId: string;

  beforeAll(async () => {
    const region = await db.region.create({
      data: {
        slug: `${prefix}-region`,
        name: "R",
        description: "",
        artKey: "r",
        published: true,
      },
    });
    const location = await db.location.create({
      data: {
        slug: `${prefix}-loc`,
        regionId: region.id,
        name: "L",
        description: "",
        artKey: "l",
        published: true,
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
    await db.npcShopRestockConfig.create({
      data: {
        shopId,
        targetListings: 4,
        commonMin: 2,
        commonMax: 3,
        uncommonMin: 1,
        uncommonMax: 2,
        rareMin: 0,
        rareMax: 1,
        ultraRareBps: 0,
      },
    });
    const rarities: Array<[string, Rarity]> = [
      ["c1", Rarity.COMMON],
      ["c2", Rarity.COMMON],
      ["c3", Rarity.COMMON],
      ["c4", Rarity.COMMON],
      ["u1", Rarity.UNCOMMON],
      ["u2", Rarity.UNCOMMON],
      ["r1", Rarity.RARE],
    ];
    for (const [suffix, rarity] of rarities) {
      const item = await db.item.create({
        data: {
          slug: `${prefix}-${suffix}`,
          name: suffix,
          description: "",
          artKey: suffix,
          price: 10,
          rarity,
        },
      });
      await db.npcShopPoolEntry.create({
        data: {
          shopId,
          itemId: item.id,
          shopRarity: rarity,
          price: 10,
          weight: 10,
          minQuantity: 2,
          maxQuantity: 6,
        },
      });
    }
  });

  afterAll(async () => {
    await db.npcShopStock.deleteMany({ where: { shop: { slug: `${prefix}-shop` } } });
    await db.shopRestock.deleteMany({ where: { shop: { slug: `${prefix}-shop` } } });
    await db.npcShop.deleteMany({ where: { slug: `${prefix}-shop` } });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  const windowA = new Date("2026-08-06T00:00:00Z");
  const windowB = new Date("2026-08-06T08:00:00Z");

  it("retrying the same window returns the same restock without duplicating stock", async () => {
    const first = await executeRestock(db, { shopId, windowStart: windowA });
    const stockAfterFirst = await db.npcShopStock.count({
      where: { shopId, restockId: first.id },
    });
    const retry = await executeRestock(db, { shopId, windowStart: windowA });
    expect(retry.id).toBe(first.id);
    expect(retry.status).toBe("COMPLETED");
    const stockAfterRetry = await db.npcShopStock.count({
      where: { shopId, restockId: first.id },
    });
    expect(stockAfterRetry).toBe(stockAfterFirst);
    const restocks = await db.shopRestock.count({
      where: { shopId, windowStart: windowA },
    });
    expect(restocks).toBe(1);
  });

  it("concurrent executions converge on one completed restock", async () => {
    const results = await Promise.all([
      executeRestock(db, { shopId, windowStart: windowB }),
      executeRestock(db, { shopId, windowStart: windowB }),
      executeRestock(db, { shopId, windowStart: windowB }),
    ]);
    const ids = new Set(results.map((restock) => restock.id));
    expect(ids.size).toBe(1);
    expect(results.every((restock) => restock.status === "COMPLETED")).toBe(true);
    const restocks = await db.shopRestock.count({
      where: { shopId, windowStart: windowB },
    });
    expect(restocks).toBe(1);
  });

  it("fully replaces prior stock atomically and keeps history", async () => {
    const windowC = new Date("2026-08-06T16:00:00Z");
    const before = await db.npcShopStock.findMany({
      where: { shopId, status: "ACTIVE" },
    });
    expect(before.length).toBeGreaterThan(0);

    const restock = await executeRestock(db, { shopId, windowStart: windowC });

    const active = await db.npcShopStock.findMany({
      where: { shopId, status: "ACTIVE" },
    });
    expect(active.every((stock) => stock.restockId === restock.id)).toBe(true);
    // Prior rows survive as EXPIRED audit history.
    const expired = await db.npcShopStock.count({
      where: { shopId, status: "EXPIRED" },
    });
    expect(expired).toBeGreaterThanOrEqual(before.length);
  });
});
