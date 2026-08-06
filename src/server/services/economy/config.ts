/**
 * Content-configurable economy constants. Values here are placeholder
 * tuning, deliberately centralized so balancing never requires hunting
 * through services.
 */

/** Listing slots a brand-new player shop starts with. */
export const BASE_SHOP_CAPACITY = 8;

/** Hard bounds keeping totals well inside 32-bit integer columns. */
export const MAX_UNIT_PRICE = 1_000_000_000;
export const MAX_LISTING_QUANTITY = 1_000;
export const MAX_TRANSACTION_TOTAL = 2_000_000_000;

/** Maximum units per single NPC purchase request. */
export const MAX_NPC_PURCHASE_QUANTITY = 10;

/** Purchases at or above this total are audit-logged as high-value. */
export const HIGH_VALUE_THRESHOLD = 1_000;

/** Fixed-window rate limits per authenticated account. */
export const RATE_LIMITS = {
  "npc-purchase": { limit: 20, windowSeconds: 60 },
  "player-purchase": { limit: 20, windowSeconds: 60 },
  "listing-mutation": { limit: 30, windowSeconds: 60 },
  "proceeds-claim": { limit: 6, windowSeconds: 60 },
  "capacity-upgrade": { limit: 6, windowSeconds: 60 },
  "market-search": { limit: 60, windowSeconds: 60 },
} as const;

export type RateLimitedOperation = keyof typeof RATE_LIMITS;

/**
 * Secret used to derive deterministic restock seeds. MUST be set to a
 * strong random value in production; the fallback exists only so local
 * development works out of the box.
 */
export function restockSeedSecret(): string {
  return process.env.RESTOCK_SEED_SECRET ?? "dev-only-restock-seed";
}

/** Bearer token required by the internal restock cron endpoint. */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET;
}
