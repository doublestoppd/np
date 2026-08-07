import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Fishing rate limits. A cast can grant an item, so it is bounded like
 * other economic mutations. The per-spot daily cap is a separate,
 * content-configured gameplay rule; this is abuse protection only.
 */
const RULES = {
  cast: { name: "fishing-cast", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export async function enforceFishingRateLimit(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES.cast, userId, { userId, now });
}
