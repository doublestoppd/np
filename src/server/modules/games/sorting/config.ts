import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/**
 * Stable content key for the bench's activity attachment. The bench has
 * no seeded configuration — its rules and tiers are code — so there is
 * exactly one of it and exactly one key.
 */
export const SORTING_BENCH_ACTIVITY_KEY = "saltmere-sorting-bench";

/** Scoring and payout version, frozen onto each run at creation. */
export const SORTING_RULES_VERSION = 1;

/**
 * Best-of-day payout tiers.
 *
 * The shape is the whole design: **repetition pays nothing, improvement
 * pays once.** A player can sit with this for two hours because they like
 * it and the economy does not notice; a player who gets genuinely good at
 * it earns 75 coins a day and no more. That is what lets the game be
 * unlimited without being a grind, and it is why a bot that solves it
 * perfectly earns exactly what a good human earns.
 *
 * The daily ceiling sits under the word puzzle's 210 (ADR-33), so the
 * ordering of the economy survives adding a second real activity.
 */
export const SORTING_TIERS: ReadonlyArray<{ score: number; coins: bigint }> = [
  { score: 400, coins: 15n },
  { score: 1_200, coins: 35n },
  { score: 2_400, coins: 55n },
  { score: 4_000, coins: 75n },
];

/** Total coins owed for a best-of-day score. */
export function tierValue(score: number): bigint {
  let owed = 0n;
  for (const tier of SORTING_TIERS) {
    if (score >= tier.score) {
      owed = tier.coins;
    }
  }
  return owed;
}

/**
 * Abuse bounds. Generous by design — a person tapping quickly through a
 * run submits a batch every few seconds, and being rate-limited mid-run
 * would be worse than anything these prevent.
 */
const RULES = {
  "sorting-start": { name: "sorting-start", limit: 20, windowSeconds: 60 },
  "sorting-move": { name: "sorting-move", limit: 60, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type SortingRateLimitedOperation = keyof typeof RULES;

export async function enforceSortingRateLimit(
  db: DbClient,
  operation: SortingRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
