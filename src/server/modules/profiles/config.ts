import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Profile and showcase rate limits.
 *
 * These move no coins and no items, which is why they had no limits at
 * all — but a showcase write takes a per-user advisory lock and then
 * rewrites the whole list (`showcase.ts`), and moving the first entry "up"
 * is a legal no-op that still does all of it. An authenticated client
 * looping that had unbounded, self-serializing transaction throughput.
 *
 * The limits are generous: a person rearranging six showcase slots does
 * not hit them, and a script does.
 */
const RULES = {
  "update-profile": { name: "update-profile", limit: 20, windowSeconds: 60 },
  showcase: { name: "showcase", limit: 60, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type ProfileRateLimitedOperation = keyof typeof RULES;

export async function enforceProfileRateLimit(
  db: DbClient,
  operation: ProfileRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
