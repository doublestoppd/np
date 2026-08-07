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
 * it and the economy does not notice. That is what lets the game be
 * unlimited without being a grind, and it is why a bot that solves it
 * perfectly earns exactly what a good human earns.
 *
 * **The thresholds are measured, not guessed.** They come from simulating
 * 5000 real seeded decks under strategies that see only what a browser
 * sees — the board, the find in hand, and the shallow preview. Share of
 * runs reaching each tier:
 *
 *   score   coins   thoughtless   ordinary   strong
 *     600      20        99.7%      99.8%     100%
 *   1_800      45        94.4%      98.4%     100%
 *   2_800      75        56.4%      69.6%    97.7%
 *   3_500     110         8.3%      29.3%    52.6%
 *   3_900     150         0.3%       7.9%    11.4%
 *
 * So an ordinary first go is paid, a better run is paid more, and the top
 * is roughly the p90 of strong play — reached sometimes, not daily. The
 * previous ladder topped out at 4000, which sounds hard and was not: with
 * as many shelves as kinds, a fixed shelf-per-kind mapping scored 4050 on
 * every seed, so the maximum paid every time to a player making no
 * decisions. That defect is fixed in the rules (see SHELF_COUNT); these
 * numbers are what honest play actually produces afterwards.
 *
 * **The ceiling is 150, raised from 75.** The bench is the only real
 * skill activity in the game and a run takes 10-15 minutes, while the
 * daily word puzzle pays 210 for about three minutes. At 150 the word
 * puzzle remains the largest single daily, so the economy ordering
 * ADR-33 established survives, and the skill game stops being paid a
 * tenth of the coins per minute of everything else.
 */
export const SORTING_TIERS: ReadonlyArray<{ score: number; coins: bigint }> = [
  { score: 600, coins: 20n },
  { score: 1_800, coins: 45n },
  { score: 2_800, coins: 75n },
  { score: 3_500, coins: 110n },
  { score: 3_900, coins: 150n },
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
