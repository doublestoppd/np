import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * The Leaving Shelf: rules, limits, and the vocabulary of freshness.
 *
 * There is exactly one shelf and its configuration is code, not content —
 * the same shape as the Sorting Bench. A second shelf would split the
 * pool, and a pool that is split twice is two empty shelves.
 */
export const GIVEAWAY_ACTIVITY_KEY = "mossy-market-leaving-shelf";

/**
 * How long a lot stays takeable.
 *
 * Two hours is short on purpose, and it is the only reason the shelf works
 * at all: a shelf that kept things forever would be free unlimited storage
 * with a public door, and the good stuff would be swept by whoever polled
 * hardest. A short life means the shelf is mostly other people's *recent*
 * spares, which is the thing worth walking past.
 *
 * What it must never become is a countdown. Nothing here is exclusive —
 * every item on this shelf is an ordinary item obtainable elsewhere — so
 * there is nothing to miss out on, and the interface says how fresh a lot
 * is rather than how long it has left (see `describeFreshness`).
 */
export const OFFERING_LIFETIME_MS = 2 * 60 * 60 * 1000;

/** Most copies one lot may hold. Re-exported from the input schema. */
export { GIVEAWAY_MAX_QUANTITY } from "@/lib/validation";

/**
 * The day's caps, per player, on the UTC game day.
 *
 * These are not a tax on generosity — they are what keeps the shelf a
 * shelf. Player-to-player transfer here is free, instant, and untaxed, so
 * without a ceiling two accounts could move a satchel a day between them
 * (docs/architecture-decisions.md ADR-43). Both caps sit far above what a
 * person clearing out their satchel does in an evening.
 */
export const DONATIONS_PER_DAY = 10;
export const TAKES_PER_DAY = 5;

/**
 * How many live lots the shelf holds at once.
 *
 * A ceiling, not a queue: when the shelf is full nothing is evicted, the
 * next donation is simply refused until something is taken or goes cold.
 * Evicting would let a flood of cheap lots push somebody's real gift off
 * the shelf, which is the one failure mode worth designing out.
 */
export const SHELF_CAPACITY = 40;

const RULES = {
  "giveaway-leave": { name: "giveaway-leave", limit: 20, windowSeconds: 60 },
  "giveaway-take": { name: "giveaway-take", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type GiveawayRateLimitedOperation = keyof typeof RULES;

export async function enforceGiveawayRateLimit(
  db: DbClient,
  operation: GiveawayRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}

/** How long a lot has been standing there, in words rather than in time. */
export type Freshness = "JUST_LEFT" | "RECENT" | "A_WHILE";

/**
 * Describes a lot's age the way a person glancing at a shelf would.
 *
 * Deliberately three coarse buckets and never a number. A timer next to
 * free goods manufactures exactly the scramble CLAUDE.md rules out — and
 * it would be a scramble over nothing, since the shelf holds ordinary
 * items anybody can also buy, forage, or be given. "Been here a while" is
 * a nudge to take it if you want it; "4:52 remaining" is an instruction to
 * come back and refresh.
 */
export function describeFreshness(offeredAt: Date, now: Date): Freshness {
  const age = now.getTime() - offeredAt.getTime();
  if (age < 15 * 60 * 1000) return "JUST_LEFT";
  if (age < 75 * 60 * 1000) return "RECENT";
  return "A_WHILE";
}

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  JUST_LEFT: "Just left",
  RECENT: "Left a while back",
  A_WHILE: "Been here a while",
};
