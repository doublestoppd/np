import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * The Wandering Lantern: configuration and the shape of its generosity.
 *
 * The lantern is tucked away at one location each game day and a riddle
 * pointing at it is posted at the beacon. Looking happens everywhere; the
 * notice only tells you where to start thinking.
 */

/** Looks per player per game day. */
export const LOOKS_PER_DAY = 3;

/**
 * What a find pays, by which look found it.
 *
 * Descending on purpose. Every outcome pays — nobody is punished for
 * brute-forcing it — but solving the riddle outright is worth noticeably
 * more than working through the map, which is the difference between a
 * puzzle and a scratchcard. Index 0 is the first look.
 */
export const REWARD_BY_LOOK = [90n, 60n, 40n] as const;

/**
 * Where the riddle is posted. One notice, at the lamp tower that is
 * conspicuously missing a lamp — the joke only works if it lives there.
 */
export const LANTERN_ACTIVITY_KEY = "wandering-lantern";
export const LANTERN_REGION_SLUG = "saltmere";
export const LANTERN_LOCATION_SLUG = "the-quiet-beacon";

/** Display name and blurb, owned by the domain rather than by content. */
export const LANTERN_NAME = "The Wandering Lantern";
export const LANTERN_BLURB =
  "A small lamp that will not stay put. Read the note, work out where it has got to, and go and look.";

const RULES = {
  "lantern-look": { name: "lantern-look", limit: 12, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export async function enforceLanternRateLimit(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES["lantern-look"], userId, { userId, now });
}

/** Coins paid for a find on `lookNumber` (1-based). */
export function rewardForLook(lookNumber: number): bigint {
  return REWARD_BY_LOOK[lookNumber - 1] ?? REWARD_BY_LOOK[REWARD_BY_LOOK.length - 1]!;
}
