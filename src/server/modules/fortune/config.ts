import type { DbClient } from "@/server/db";
import {
  enforceRateLimit,
  type RateLimitRule,
} from "@/server/security/rate-limit";

/**
 * The Fortune Engine's dials (ADR-66).
 *
 * Everything tunable about the machine's economy is in this file. The
 * reels themselves are in lib/games/fortune/reels.ts, and the exact return
 * they produce is enumerated in the test beside them — so a change here
 * and a change there are both single-file changes with a number attached.
 */

/** There is exactly one machine, so its attachment key is fixed. */
export const FORTUNE_ACTIVITY_KEY = "the-fortune-engine";

/**
 * What a pull costs, smallest first. The last one is the top stake.
 *
 * Three rungs rather than a free amount: a text box invites a player to
 * stake their whole balance on one pull, and a machine returning 68% is
 * not a thing anybody should be able to do that with by accident.
 */
export const STAKES: readonly bigint[] = [25n, 100n, 500n];

export const TOP_STAKE = STAKES[STAKES.length - 1] as bigint;

export function isValidStake(stake: bigint): boolean {
  return STAKES.includes(stake);
}

/** The pool's slug. One machine, one pool. */
export const JACKPOT_SLUG = "fortune-engine";

/**
 * What the pool pays when it is fresh, and what it is re-armed to after a
 * win.
 *
 * This is the one place the machine puts coins into the economy that no
 * player staked, and it is deliberate: a progressive that starts at zero
 * is not a jackpot, it is a rounding error with a countdown. At a 500 top
 * stake and 1-in-32,768 odds, a player who chased this to the floor alone
 * would have staked over sixteen million coins for it — so the floor is
 * enormous next to a day's income and tiny next to what it costs to reach.
 */
export const JACKPOT_MINIMUM = 150_000n;

/**
 * Basis points of each TOP-stake pull that feed the pool.
 *
 * Only the top stake pays in, and only the top stake can win — see
 * `evaluate` in the reels. A machine that took a slice of every stake for
 * a lottery most of them could not enter would be quietly charging the
 * cautious to entertain the reckless.
 */
export const JACKPOT_FEED_BPS = 500n;

/**
 * A ceiling on pulls per minute, not per day.
 *
 * Deliberately not a daily cap: the player is spending their own coins on
 * a thing that is honestly priced, and a daily cap on that is a second
 * price (the same reasoning the chits and the Drums give). This bounds
 * automation and sits well above what a person can tap, and well above the
 * reels, which take about a second and a half to settle.
 */
const RULES = {
  spin: { name: "fortune-spin", limit: 40, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export async function enforceFortuneRateLimit(
  db: DbClient,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES.spin, userId, { userId, now });
}
