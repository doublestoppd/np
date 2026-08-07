import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/** Active prize weights on a card are basis points summing to exactly this. */
export const SCRATCH_TOTAL_WEIGHT = 10_000;

/**
 * The chit stall. One shop, in the sheds where the salt is dried, because
 * that is where the chits are made.
 */
export const CHIT_SHOP_SLUG = "raker-chit-table";

/** The one world-wide pool. */
export const JACKPOT_SLUG = "the-pans";

/**
 * Floor paid when the pool is short of it. The shortfall is minted, which
 * is the only coin this feature creates from nothing — bounded to this
 * much per win, and wins run about one in two thousand scratches.
 */
export const JACKPOT_MINIMUM = 2_000n;

const RULES = {
  scratch: { name: "scratch-card", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * A ceiling on scratches per minute, not per day.
 *
 * Deliberately not a daily cap: a daily cap on a thing you already paid
 * for is a second price, and it would turn "I have six chits" into a chore
 * spread over a week. This exists only to bound automation, and it sits
 * well above what a person can physically tap.
 */
export async function enforceScratchRateLimit(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES.scratch, userId, { userId, now });
}
