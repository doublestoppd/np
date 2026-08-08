import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Pet-care rate limits. Care actions consume items, so they are bounded
 * like commerce mutations (docs/operations.md — anti-abuse controls).
 */
const RULES = {
  "feed-pet": { name: "feed-pet", limit: 30, windowSeconds: 60 },
  "play-with-pet": { name: "play-with-pet", limit: 30, windowSeconds: 60 },
  "read-to-pet": { name: "read-to-pet", limit: 30, windowSeconds: 60 },
  "treat-pet": { name: "treat-pet", limit: 30, windowSeconds: 60 },
  "groom-pet": { name: "groom-pet", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type PetCareRateLimitedOperation = keyof typeof RULES;

export async function enforcePetCareRateLimit(
  db: DbClient,
  operation: PetCareRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
