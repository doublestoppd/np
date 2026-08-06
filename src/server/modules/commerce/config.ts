import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Commerce-specific configuration and thresholds. Generic primitives live
 * in src/server/security; monetary bounds live in src/lib/money.ts;
 * technical limits in src/server/security/limits.ts.
 */

/** Listing slots a brand-new player shop starts with. */
export const BASE_SHOP_CAPACITY = 8;

/** Purchases at or above this total are audit-logged as high-value. */
export const HIGH_VALUE_THRESHOLD = 1_000n;

const RULES = {
  "npc-purchase": { name: "npc-purchase", limit: 20, windowSeconds: 60 },
  "player-purchase": { name: "player-purchase", limit: 20, windowSeconds: 60 },
  "listing-mutation": { name: "listing-mutation", limit: 30, windowSeconds: 60 },
  "proceeds-claim": { name: "proceeds-claim", limit: 6, windowSeconds: 60 },
  "capacity-upgrade": { name: "capacity-upgrade", limit: 6, windowSeconds: 60 },
  "market-search": { name: "market-search", limit: 60, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type CommerceRateLimitedOperation = keyof typeof RULES;

export async function enforceCommerceRateLimit(
  db: DbClient,
  operation: CommerceRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}

/**
 * Secret used to derive deterministic restock seeds. Production startup
 * fails when this is missing or a known dev value
 * (src/server/security/configuration.ts).
 */
export function restockSeedSecret(): string {
  return process.env.RESTOCK_SEED_SECRET ?? "dev-only-restock-seed";
}

/** Bearer token required by the internal restock cron endpoint. */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET;
}
