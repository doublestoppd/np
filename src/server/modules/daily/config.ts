import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Narrow shared configuration for the daily activities. Each activity keeps
 * its own rules and tables; only the seed secret, rate limits, and audit
 * event names are shared.
 */

/**
 * Secret for deterministic daily-puzzle answer selection. Distinct from the
 * restock secret so the two can rotate independently. Production startup
 * fails when it is missing or a known dev value
 * (src/server/security/configuration.ts).
 */
export function dailySeedSecret(): string {
  return process.env.DAILY_SEED_SECRET ?? "dev-local-daily-seed";
}

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
