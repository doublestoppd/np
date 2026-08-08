import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * The Sunken Stair: shape and stakes (ADR-59).
 *
 * One descent per player per game day, ten rooms deep, two ways on in
 * each. The correct way is drawn per delve and lives on the server.
 */

/**
 * One cave means one attachment. Two would render the same delve in two
 * places and let a player answer the same room twice in the interface
 * while the guarded append silently refused the second. Validated offline.
 */
export const CAVE_ACTIVITY_KEY = "the-sunken-stair";

/** How deep it goes. The CHECK constraint on `sectionIndex` mirrors it. */
export const CAVE_DEPTH = 10;

/**
 * What is found, and where.
 *
 * Caches at every even depth, each worth more than the last, and the
 * hoard at the bottom. A cache is paid the moment it is found and is
 * never taken back — being seen off at room seven leaves you with
 * everything rooms two, four and six gave you.
 *
 * **The arithmetic, stated plainly, because it is the whole balance of
 * this activity.** Each room is an even choice, so reaching depth N has
 * probability 1/2^N. Expected coins per attempt:
 *
 *   40/4 + 120/16 + 400/64 + 1200/256 + 6000/1024
 *   = 10 + 7.5 + 6.25 + 4.69 + 5.86  ≈  34 coins
 *
 * That is deliberately modest: it sits below every other daily, because
 * unlike them it asks for no skill and no time. What it sells is the
 * ninety seconds of nerve on the way down.
 *
 * The hoard is reached on 1 attempt in 1,024 — about once every three
 * years of playing every single day. That is stated here rather than
 * buried: it is the number to change if the ten things at the bottom
 * should ever actually be seen (see ADR-59's open question).
 */
export const CAVE_CACHES: ReadonlyMap<number, bigint> = new Map([
  [2, 40n],
  [4, 120n],
  [6, 400n],
  [8, 1_200n],
  [10, 6_000n],
]);

/** Coins found at this depth, or null when the room holds nothing. */
export function cacheAt(depth: number): bigint | null {
  return CAVE_CACHES.get(depth) ?? null;
}

/**
 * Everything the caches would pay for a clean descent. Shown before the
 * player starts, so "what is this worth" is answerable without playing —
 * the odds are not published, but the ladder is, exactly as it is for the
 * chits and the drums (ADR-48).
 */
export function totalOnOffer(): bigint {
  let total = 0n;
  for (const coins of CAVE_CACHES.values()) {
    total += coins;
  }
  return total;
}


const RULES = {
  /**
   * A descent is at most ten choices and cannot be restarted, so the
   * ceiling here is not about pacing the game — it is about a script
   * hammering the endpoint. Twenty a minute is far above any human and
   * far below anything worth doing.
   */
  choose: { name: "cave-choose", limit: 20, windowSeconds: 60 },
  begin: { name: "cave-begin", limit: 6, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type CaveRateLimitedOperation = keyof typeof RULES;

export async function enforceCaveRateLimit(
  db: DbClient,
  operation: CaveRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
