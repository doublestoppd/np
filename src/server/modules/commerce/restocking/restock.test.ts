/**
 * Restock engine tests: the pure deterministic planner, anchored per-shop
 * schedules, and executor idempotency/concurrency/non-blocking/failure
 * persistence against a real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NpcShopRestockConfig, PrismaClient } from "@prisma/client";
import { Rarity } from "@prisma/client";
import { planRestock, eligibleEntries, type PoolEntryWithItem } from "./plan";
import { computeWindowStart } from "./schedule";
import { ensureShopStocked, executeRestock } from "./execute";
import { EconomyError } from "../errors";
import { withFault, InjectedFault } from "@test/helpers/fault-injection";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const SECRET = "test-secret";
const EPOCH = new Date("1970-01-01T00:00:00Z");

function makeConfig(
  overrides: Partial<NpcShopRestockConfig> = {},
): NpcShopRestockConfig {
  return {
    id: "cfg",
    shopId: "shop-1",
    intervalMinutes: 480,
    anchorAt: EPOCH,
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
    lifecycle = "ACTIVE",
  }: {
    weight?: number;
    minQuantity?: number;
    maxQuantity?: number;
    active?: boolean;
    availableFrom?: Date | null;
    availableUntil?: Date | null;
    lifecycle?: "DRAFT" | "ACTIVE" | "RETIRED" | "DISABLED";
  } = {},
): PoolEntryWithItem {
  poolCounter++;
  return {
    id: `pool-${poolCounter}`,
    shopId: "shop-1",
    itemId: `item-${slug}`,
    shopRarity,
    price: 10n,
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
      price: 10n,
      rarity: shopRarity,
      lifecycle,
      tradeable: true,
      stackable: true,
      provenancePolicy: "NONE",
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

describe("computeWindowStart (anchored schedules)", () => {
  it("computes windows relative to the shop's own anchor", () => {
    const anchored = {
      intervalMinutes: 480,
      anchorAt: new Date("2026-08-06T03:15:00Z"),
    };
    expect(
      computeWindowStart(anchored, new Date("2026-08-06T10:00:00Z"))?.toISOString(),
    ).toBe("2026-08-06T03:15:00.000Z");
    expect(
      computeWindowStart(anchored, new Date("2026-08-06T11:20:00Z"))?.toISOString(),
    ).toBe("2026-08-06T11:15:00.000Z");
  });

  it("two shops with the same interval restock at different times", () => {
    const now = new Date("2026-08-06T12:00:00Z");
    const shopA = { intervalMinutes: 480, anchorAt: EPOCH };
    const shopB = {
      intervalMinutes: 480,
      anchorAt: new Date("2026-08-06T02:00:00Z"),
    };
    const windowA = computeWindowStart(shopA, now);
    const windowB = computeWindowStart(shopB, now);
    expect(windowA?.toISOString()).toBe("2026-08-06T08:00:00.000Z");
    expect(windowB?.toISOString()).toBe("2026-08-06T10:00:00.000Z");
    expect(windowA?.getTime()).not.toBe(windowB?.getTime());
  });

  it("returns null before the anchor and for invalid intervals", () => {
    expect(
      computeWindowStart(
        { intervalMinutes: 60, anchorAt: new Date("2030-01-01T00:00:00Z") },
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).toBeNull();
    expect(
      computeWindowStart({ intervalMinutes: 0, anchorAt: EPOCH }, new Date()),
    ).toBeNull();
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
      poolEntries: [...pool].reverse(),
      secret: SECRET,
    });
    expect(second).toEqual(first);
  });

  it("different windows produce independent results", () => {
    const config = makeConfig();
    const pool = bigPool();
    const windows = [0, 8, 16, 24].map(
      (hours) => new Date(WINDOW.getTime() + hours * 3_600_000),
    );
    const plans = windows.map((windowStart) =>
      planRestock({ shopId: "shop-1", windowStart, config, poolEntries: pool, secret: SECRET }),
    );
    expect(new Set(plans.map((plan) => plan.seedId)).size).toBe(windows.length);
    const signatures = new Set(
      plans.map((plan) =>
        plan.listings.map((l) => `${l.itemSlug}:${l.quantity}`).join(","),
      ),
    );
    expect(signatures.size).toBeGreaterThan(1);
  });

  it("selects a composition matching the configured bounds exactly", () => {
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
  });

  it("rejects configurations with no valid composition", () => {
    const config = makeConfig({ commonMin: 1, commonMax: 2, uncommonMax: 1, rareMax: 1 });
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

  it("never duplicates items, keeps quantities in bounds, honors the ultra roll", () => {
    const always = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 10_000 }),
      poolEntries: bigPool(),
      secret: SECRET,
    });
    const slugs = always.listings.map((l) => l.itemSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(always.listings.filter((l) => l.shopRarity === "ULTRA_RARE")).toHaveLength(1);
    for (const listing of always.listings) {
      expect(listing.quantity).toBeGreaterThanOrEqual(1);
      expect(listing.quantity).toBeLessThanOrEqual(5);
    }
    const never = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 0 }),
      poolEntries: bigPool(),
      secret: SECRET,
    });
    expect(never.listings.filter((l) => l.shopRarity === "ULTRA_RARE")).toHaveLength(0);
  });

  it("excludes date-ineligible, inactive, and non-distributable (RETIRED/DRAFT) entries", () => {
    const pool = [
      ...bigPool(),
      makeEntry("expired-limited", Rarity.UNCOMMON, {
        weight: 100_000,
        availableUntil: new Date("2026-01-01T00:00:00Z"),
      }),
      makeEntry("retired-item", Rarity.UNCOMMON, {
        weight: 100_000,
        lifecycle: "RETIRED",
      }),
      makeEntry("draft-item", Rarity.UNCOMMON, {
        weight: 100_000,
        lifecycle: "DRAFT",
      }),
    ];
    const eligible = eligibleEntries(pool, WINDOW).map((entry) => entry.item.slug);
    expect(eligible).not.toContain("expired-limited");
    expect(eligible).not.toContain("retired-item");
    expect(eligible).not.toContain("draft-item");
  });

  it("backfills only downward and shrinks safely when pools run short", () => {
    const noUltra = bigPool().filter((entry) => entry.shopRarity !== "ULTRA_RARE");
    const plan = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 10_000 }),
      poolEntries: noUltra,
      secret: SECRET,
    });
    expect(plan.backfilled.toRare).toBe(1);
    expect(plan.listings.filter((l) => l.shopRarity === "ULTRA_RARE")).toHaveLength(0);
    expect(plan.listings.length).toBe(makeConfig().targetListings);

    const tiny = [
      makeEntry("common-a", Rarity.COMMON),
      makeEntry("common-b", Rarity.COMMON),
      makeEntry("uncommon-a", Rarity.UNCOMMON),
      makeEntry("uncommon-b", Rarity.UNCOMMON),
      makeEntry("uncommon-c", Rarity.UNCOMMON),
      makeEntry("uncommon-d", Rarity.UNCOMMON),
      makeEntry("rare-a", Rarity.RARE),
    ];
    const short = planRestock({
      shopId: "shop-1",
      windowStart: WINDOW,
      config: makeConfig({ ultraRareBps: 0 }),
      poolEntries: tiny,
      secret: SECRET,
    });
    expect(short.listings.filter((l) => l.shopRarity === "COMMON")).toHaveLength(2);
    expect(short.backfilled.unfilled).toBeGreaterThan(0);
    expect(
      short.listings.filter((l) => l.shopRarity === "UNCOMMON").length,
    ).toBeLessThanOrEqual(makeConfig().uncommonMax);
    expect(short.listings.length).toBeLessThan(makeConfig().targetListings);
  });
});

const prefix = fixturePrefix("restock");

describe.skipIf(!testDb)("executeRestock (integration)", () => {
  const db = testDb as PrismaClient;
  let shopId: string;

  beforeAll(async () => {
    const region = await db.region.create({
      data: { slug: `${prefix}-region`, name: "R", description: "", artKey: "r", published: true },
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
      data: { locationId: location.id, slug: `${prefix}-shop`, name: "Fixture Shop", description: "" },
    });
    shopId = shop.id;
    await db.npcShopRestockConfig.create({
      data: {
        shopId,
        intervalMinutes: 480,
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
      ["u1", Rarity.UNCOMMON],
      ["u2", Rarity.UNCOMMON],
      ["r1", Rarity.RARE],
    ];
    for (const [suffix, rarity] of rarities) {
      const item = await createTestItem(db, { slug: `${prefix}-${suffix}`, rarity });
      await db.npcShopPoolEntry.create({
        data: {
          shopId,
          itemId: item.id,
          shopRarity: rarity,
          price: 10n,
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
    await cleanupTestItems(db, prefix);
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  const windowA = new Date("2026-08-06T00:00:00Z");
  const windowB = new Date("2026-08-06T08:00:00Z");
  const windowC = new Date("2026-08-06T16:00:00Z");
  const windowD = new Date("2026-08-07T00:00:00Z");

  it("retries return the same restock without duplicating stock", async () => {
    const first = await executeRestock(db, { shopId, windowStart: windowA });
    const count = await db.npcShopStock.count({ where: { restockId: first.id } });
    const retry = await executeRestock(db, { shopId, windowStart: windowA });
    expect(retry.id).toBe(first.id);
    expect(await db.npcShopStock.count({ where: { restockId: first.id } })).toBe(count);
  });

  it("concurrent scheduled + lazy execution creates exactly one restock", async () => {
    const { fulfilled, durationMs } = await runConcurrently([
      () => executeRestock(db, { shopId, windowStart: windowB }),
      () => executeRestock(db, { shopId, windowStart: windowB }),
      () => executeRestock(db, { shopId, windowStart: windowB }),
    ]);
    expect(new Set(fulfilled.map((restock) => restock.id)).size).toBe(1);
    expect(
      await db.shopRestock.count({ where: { shopId, windowStart: windowB } }),
    ).toBe(1);
    // Bounded contention observation (logged for the report).
    expect(durationMs).toBeLessThan(10_000);
  });

  it("fully replaces prior stock atomically and keeps audit history", async () => {
    const before = await db.npcShopStock.findMany({ where: { shopId, status: "ACTIVE" } });
    expect(before.length).toBeGreaterThan(0);
    const restock = await executeRestock(db, { shopId, windowStart: windowC });
    const active = await db.npcShopStock.findMany({ where: { shopId, status: "ACTIVE" } });
    expect(active.every((stock) => stock.restockId === restock.id)).toBe(true);
    expect(
      await db.npcShopStock.count({ where: { shopId, status: "EXPIRED" } }),
    ).toBeGreaterThanOrEqual(before.length);
  });

  it("persists a FAILED record when replacement rolls back, then a retry succeeds once", async () => {
    const faulty = withFault(db, { model: "npcShopStock", method: "createMany" });
    await expect(
      executeRestock(faulty, { shopId, windowStart: windowD }),
    ).rejects.toThrowError(InjectedFault);

    const failed = await db.shopRestock.findUniqueOrThrow({
      where: { shopId_windowStart: { shopId, windowStart: windowD } },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.attemptCount).toBe(1);
    expect(failed.error).toContain("Injected fault");
    // The rolled-back attempt inserted nothing.
    expect(await db.npcShopStock.count({ where: { restockId: failed.id } })).toBe(0);
    // Prior stock is untouched by the failed attempt.
    expect(
      await db.npcShopStock.count({ where: { shopId, status: "ACTIVE" } }),
    ).toBeGreaterThan(0);

    const retried = await executeRestock(db, { shopId, windowStart: windowD });
    expect(retried.id).toBe(failed.id);
    expect(retried.status).toBe("COMPLETED");
    const stock = await db.npcShopStock.count({ where: { restockId: retried.id } });
    expect(stock).toBeGreaterThan(0);
    // Replaying the completed window does not duplicate inventory.
    await executeRestock(db, { shopId, windowStart: windowD });
    expect(await db.npcShopStock.count({ where: { restockId: retried.id } })).toBe(stock);
  });

  it("the non-blocking lazy path yields 'busy' instead of queueing behind the lock", async () => {
    const windowE = new Date("2026-08-07T08:00:00Z");
    // Hold the shop's advisory lock in a separate connection/transaction.
    const holder = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shopId}))`;
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    await new Promise((resolve) => setTimeout(resolve, 150));

    const started = Date.now();
    const outcome = await ensureShopStocked(db, shopId, windowE);
    const elapsed = Date.now() - started;
    expect(outcome).toBe("busy");
    // It did not wait for the 700ms lock holder.
    expect(elapsed).toBeLessThan(500);
    await holder;

    // Once the lock frees, the lazy path performs the restock.
    const second = await ensureShopStocked(db, shopId, windowE);
    expect(second).toBe("refreshed");
    expect(await ensureShopStocked(db, shopId, windowE)).toBe("current");
  });
});
