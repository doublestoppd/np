import { Prisma, Rarity } from "@prisma/client";
import type {
  Item,
  NpcShopPoolEntry,
  NpcShopRestockConfig,
  PrismaClient,
  ShopRestock,
} from "@prisma/client";
import { createRng, restockSeed, type DeterministicRng } from "./prng";
import { restockSeedSecret } from "./config";
import { EconomyError } from "./errors";

/**
 * Scheduled weighted restocking (docs/operations.md).
 *
 * Restocks are deterministic per (shop, scheduled window, server secret):
 * the scheduler, the lazy fallback, retries, and concurrent attempts all
 * converge on the same result. Idempotency is anchored by the unique
 * (shopId, windowStart) constraint plus a per-shop advisory lock; the plan
 * itself is a pure function so it can be previewed and audited.
 */

export type PoolEntryWithItem = NpcShopPoolEntry & { item: Item };

export interface PlannedListing {
  itemId: string;
  itemSlug: string;
  shopRarity: Rarity;
  price: number;
  quantity: number;
}

export interface RestockPlan {
  seedId: string;
  ultraRareSelected: boolean;
  composition: { common: number; uncommon: number; rare: number; ultraRare: number };
  backfilled: { toRare: number; toUncommon: number; toCommon: number; unfilled: number };
  listings: PlannedListing[];
}

const TIER_ORDER: Rarity[] = [
  Rarity.ULTRA_RARE,
  Rarity.RARE,
  Rarity.UNCOMMON,
  Rarity.COMMON,
];

/** UTC-aligned start of the current scheduled window. */
export function computeWindowStart(intervalHours: number, now: Date): Date {
  const intervalMs = intervalHours * 3_600_000;
  return new Date(Math.floor(now.getTime() / intervalMs) * intervalMs);
}

/** Pool entries active and date-eligible at the window start. */
export function eligibleEntries(
  entries: PoolEntryWithItem[],
  windowStart: Date,
): PoolEntryWithItem[] {
  return entries
    .filter(
      (entry) =>
        entry.active &&
        entry.item.active &&
        (entry.availableFrom === null || entry.availableFrom <= windowStart) &&
        (entry.availableUntil === null || entry.availableUntil > windowStart),
    )
    // Deterministic ordering is load-bearing: selection must not depend on
    // database row order.
    .sort((a, b) => a.item.slug.localeCompare(b.item.slug));
}

function weightedSampleWithoutReplacement(
  rng: DeterministicRng,
  pool: PoolEntryWithItem[],
  count: number,
): PoolEntryWithItem[] {
  const remaining = [...pool];
  const picks: PoolEntryWithItem[] = [];
  while (picks.length < count && remaining.length > 0) {
    const total = remaining.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng.nextInt(total);
    let index = 0;
    while (roll >= (remaining[index] as PoolEntryWithItem).weight) {
      roll -= (remaining[index] as PoolEntryWithItem).weight;
      index++;
    }
    picks.push(...remaining.splice(index, 1));
  }
  return picks;
}

/**
 * Pure deterministic restock planner. Implements the documented algorithm:
 * independent ultra-rare roll, exact composition enumeration within
 * configured tier bounds, weighted selection without replacement, per-item
 * deterministic quantities, and downward-only backfill.
 */
export function planRestock({
  shopId,
  windowStart,
  config,
  poolEntries,
  secret = restockSeedSecret(),
}: {
  shopId: string;
  windowStart: Date;
  config: NpcShopRestockConfig;
  poolEntries: PoolEntryWithItem[];
  secret?: string;
}): RestockPlan {
  const { seed, seedId } = restockSeed(secret, shopId, windowStart);
  const rng = createRng(seed);
  const eligible = eligibleEntries(poolEntries, windowStart);

  // Independent ultra-rare eligibility roll; at most one listing by default.
  const ultraRareSelected =
    config.maxUltraRare >= 1 && rng.nextInt(10_000) < config.ultraRareBps;
  const ultraCount = ultraRareSelected ? 1 : 0;

  // Enumerate every integer composition that exactly hits the target.
  const remainingTarget = config.targetListings - ultraCount;
  const compositions: Array<{ common: number; uncommon: number; rare: number }> = [];
  for (let common = config.commonMin; common <= config.commonMax; common++) {
    for (let uncommon = config.uncommonMin; uncommon <= config.uncommonMax; uncommon++) {
      for (let rare = config.rareMin; rare <= config.rareMax; rare++) {
        if (common + uncommon + rare === remainingTarget) {
          compositions.push({ common, uncommon, rare });
        }
      }
    }
  }
  if (compositions.length === 0) {
    throw new EconomyError("INVALID_RESTOCK_CONFIG");
  }
  const composition = compositions[rng.nextInt(compositions.length)] as {
    common: number;
    uncommon: number;
    rare: number;
  };

  const desired: Record<Rarity, number> = {
    [Rarity.ULTRA_RARE]: ultraCount,
    [Rarity.RARE]: composition.rare,
    [Rarity.UNCOMMON]: composition.uncommon,
    [Rarity.COMMON]: composition.common,
  };

  // Select per tier, high to low; shortfall backfills only downward.
  const backfilled = { toRare: 0, toUncommon: 0, toCommon: 0, unfilled: 0 };
  const listings: PlannedListing[] = [];
  let carry = 0;
  for (const tier of TIER_ORDER) {
    const want = desired[tier] + carry;
    const pool = eligible.filter((entry) => entry.shopRarity === tier);
    const picks = weightedSampleWithoutReplacement(rng, pool, want);
    const shortfall = want - picks.length;
    if (shortfall > 0) {
      if (tier === Rarity.ULTRA_RARE) backfilled.toRare += shortfall;
      else if (tier === Rarity.RARE) backfilled.toUncommon += shortfall;
      else if (tier === Rarity.UNCOMMON) backfilled.toCommon += shortfall;
      else backfilled.unfilled = shortfall;
    }
    carry = tier === Rarity.COMMON ? 0 : shortfall;
    for (const pick of picks) {
      const span = pick.maxQuantity - pick.minQuantity + 1;
      listings.push({
        itemId: pick.itemId,
        itemSlug: pick.item.slug,
        shopRarity: tier,
        price: pick.price,
        quantity: pick.minQuantity + rng.nextInt(span),
      });
    }
  }

  return {
    seedId,
    ultraRareSelected,
    composition: {
      common: composition.common,
      uncommon: composition.uncommon,
      rare: composition.rare,
      ultraRare: ultraCount,
    },
    backfilled,
    listings,
  };
}

/**
 * Executes (or returns) the restock for a shop's given window. Safe to call
 * from the scheduler, the lazy fallback, and retries concurrently:
 * a per-shop advisory lock serializes execution, the unique constraint on
 * (shopId, windowStart) anchors idempotency, and stock replacement is
 * atomic — readers never observe an empty in-between state.
 */
export async function executeRestock(
  db: PrismaClient,
  {
    shopId,
    windowStart,
    secret,
    now = new Date(),
  }: { shopId: string; windowStart: Date; secret?: string; now?: Date },
): Promise<ShopRestock> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shopId}))`;

    const existing = await tx.shopRestock.findUnique({
      where: { shopId_windowStart: { shopId, windowStart } },
    });
    if (existing && existing.status === "COMPLETED") {
      return existing;
    }

    const shop = await tx.npcShop.findUnique({
      where: { id: shopId },
      include: { restockConfig: true, poolEntries: { include: { item: true } } },
    });
    if (!shop || !shop.restockConfig) {
      throw new EconomyError("SHOP_NOT_FOUND");
    }

    const plan = planRestock({
      shopId,
      windowStart,
      config: shop.restockConfig,
      poolEntries: shop.poolEntries,
      secret,
    });

    const restock =
      existing ??
      (await tx.shopRestock.create({
        data: { shopId, windowStart, seedId: plan.seedId, status: "PENDING" },
      }));

    // Full atomic replacement: expire everything, insert the new stock.
    await tx.npcShopStock.updateMany({
      where: { shopId, status: { in: ["ACTIVE", "SOLD_OUT"] } },
      data: { status: "EXPIRED" },
    });
    if (plan.listings.length > 0) {
      await tx.npcShopStock.createMany({
        data: plan.listings.map((listing) => ({
          shopId,
          itemId: listing.itemId,
          restockId: restock.id,
          price: listing.price,
          quantity: listing.quantity,
          initialQuantity: listing.quantity,
          status: "ACTIVE" as const,
        })),
      });
    }

    return tx.shopRestock.update({
      where: { id: restock.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        seedId: plan.seedId,
        summary: {
          composition: plan.composition,
          backfilled: plan.backfilled,
          ultraRareSelected: plan.ultraRareSelected,
          listings: plan.listings.map((listing) => ({
            slug: listing.itemSlug,
            rarity: listing.shopRarity,
            price: listing.price,
            quantity: listing.quantity,
          })),
        } as Prisma.InputJsonValue,
      },
    });
  });
}

/**
 * Lazy fallback shared by page loads and purchase attempts: brings the shop
 * to its current scheduled window if the scheduler missed it. No-op when
 * already current or restocking is disabled.
 */
export async function ensureShopStocked(
  db: PrismaClient,
  shopId: string,
  now: Date = new Date(),
): Promise<void> {
  const config = await db.npcShopRestockConfig.findUnique({
    where: { shopId },
  });
  if (!config || !config.enabled) {
    return;
  }
  const windowStart = computeWindowStart(config.intervalHours, now);
  const existing = await db.shopRestock.findUnique({
    where: { shopId_windowStart: { shopId, windowStart } },
    select: { status: true },
  });
  if (existing?.status === "COMPLETED") {
    return;
  }
  await executeRestock(db, { shopId, windowStart, now });
}

/** Runs due restocks for every enabled shop; used by the cron endpoint. */
export async function runDueRestocks(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<Array<{ shopId: string; slug: string; status: string }>> {
  const shops = await db.npcShop.findMany({
    where: { active: true, restockConfig: { isNot: null } },
    select: { id: true, slug: true },
  });
  const results: Array<{ shopId: string; slug: string; status: string }> = [];
  for (const shop of shops) {
    try {
      await ensureShopStocked(db, shop.id, now);
      results.push({ shopId: shop.id, slug: shop.slug, status: "ok" });
    } catch (error) {
      results.push({
        shopId: shop.id,
        slug: shop.slug,
        status: error instanceof Error ? error.message : "error",
      });
    }
  }
  return results;
}
