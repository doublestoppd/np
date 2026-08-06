import { Rarity } from "@prisma/client";
import type { Item, NpcShopPoolEntry, NpcShopRestockConfig } from "@prisma/client";
import { createRng, restockSeed, type DeterministicRng } from "./prng";
import { restockSeedSecret } from "../config";
import { EconomyError } from "../errors";
import { isDistributable } from "@/server/modules/items/lifecycle";

/**
 * Pure deterministic restock planner (docs/architecture-decisions.md
 * ADR-10). Same (shop, window, secret) → same plan, regardless of database
 * row order. Implements the documented algorithm: independent ultra-rare
 * roll, exact composition enumeration within configured tier bounds,
 * weighted selection without replacement, per-item deterministic
 * quantities, and downward-only backfill.
 */

export type PoolEntryWithItem = NpcShopPoolEntry & { item: Item };

export interface PlannedListing {
  itemId: string;
  itemSlug: string;
  shopRarity: Rarity;
  price: bigint;
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

/** Pool entries active, date-eligible, and distributable at the window. */
export function eligibleEntries(
  entries: PoolEntryWithItem[],
  windowStart: Date,
): PoolEntryWithItem[] {
  return entries
    .filter(
      (entry) =>
        entry.active &&
        isDistributable(entry.item.lifecycle) &&
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
