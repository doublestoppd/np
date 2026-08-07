import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Foraging rate limits. A search grants an item, so it is bounded like
 * other economic mutations. The per-spot daily cap is a separate,
 * content-configured gameplay rule — this is only abuse protection, and
 * sits well above anything a person does with their thumbs.
 */
const RULES = {
  "forage-search": { name: "forage-search", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type ForageRateLimitedOperation = keyof typeof RULES;

export async function enforceForageRateLimit(
  db: DbClient,
  operation: ForageRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
