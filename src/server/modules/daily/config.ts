import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Narrow shared configuration for the daily activities. Each activity keeps
 * its own rules and tables; only the seed secret, rate limits, and audit
 * event names are shared.
 */

const RULES = {
  "daily-word-guess": { name: "daily-word-guess", limit: 20, windowSeconds: 60 },
  "daily-wheel-spin": { name: "daily-wheel-spin", limit: 6, windowSeconds: 60 },
  "daily-food-claim": { name: "daily-food-claim", limit: 6, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type DailyRateLimitedOperation = keyof typeof RULES;

export async function enforceDailyRateLimit(
  db: DbClient,
  operation: DailyRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
