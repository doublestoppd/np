import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Stable content key for the table's activity attachment. The game has no
 * seeded configuration — its sizes and payouts are code — so there is
 * exactly one of it and exactly one key.
 */
export const MATCHING_ACTIVITY_KEY = "stonesetters-table";

/** Board sizes and payouts, frozen onto each run at creation. */
export const MATCHING_RULES_VERSION = 1;

/**
 * Generous bounds. A person playing quickly turns a stone every second or
 * so, and being rate-limited mid-board would be worse than anything this
 * prevents.
 */
const RULES = {
  "matching-start": { name: "matching-start", limit: 20, windowSeconds: 60 },
  "matching-flip": { name: "matching-flip", limit: 120, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type MatchingRateLimitedOperation = keyof typeof RULES;

export async function enforceMatchingRateLimit(
  db: DbClient,
  operation: MatchingRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
