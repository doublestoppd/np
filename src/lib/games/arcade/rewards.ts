/**
 * What an arcade run pays (ADR-62). PURE, and bigint end to end.
 *
 * The brief was "the longer you keep going, the more coins you get". Taken
 * literally that is a treadmill: an endless game with a linear reward has
 * no natural stopping point, and the correct way to play it is to keep
 * going until you are bored or sore. This game does not do that to people.
 *
 * So the curve is strictly increasing and bounded:
 *
 *     coins = cap × score / (score + half)
 *
 * Every extra gate is worth something — the promise is kept — but the
 * hundredth is worth almost nothing next to the tenth. `half` is the score
 * at which a player collects half the cap, which makes both numbers
 * legible: you can read the tuning without running the game.
 *
 * Integer division throughout, so this is exact and the same everywhere,
 * and it truncates — a run scoring 0 pays 0 rather than rounding up into
 * a free coin per attempt.
 */

export interface RewardCurve {
  /** Coins the curve approaches and never reaches. */
  cap: bigint;
  /** The score that collects half the cap. */
  half: bigint;
}

export function coinsForScore(curve: RewardCurve, score: number): bigint {
  if (!Number.isFinite(score) || score <= 0) return 0n;
  const s = BigInt(Math.floor(score));
  return (curve.cap * s) / (s + curve.half);
}

/**
 * The two curves, and the arithmetic behind them.
 *
 * Both games are tuned so a comfortable few minutes lands near the knee
 * and heroics land near the cap. At 3 claims a day the ceiling for one
 * game is 3 × cap = 165 coins, and for both together 330 — under one
 * clear of the word puzzle plus one Deep board, and well under a day's
 * total income. A player who is simply bad at action games still collects:
 * The Paper Bird pays 15 coins for six gates, which is a first attempt.
 *
 * The pair is deliberately NOT balanced against each other by score, which
 * would be meaningless — a gate and a branch are not the same unit. They
 * are balanced by roughly how long a run of each takes.
 */
export const PAPER_BIRD_CURVE: RewardCurve = { cap: 55n, half: 16n };
/**
 * The climb's `half` is far larger because its scores are: a gate takes
 * 62 ticks to reach and a branch takes about 34, and a good climber does
 * not die for a long time. An autopilot aiming perfectly reached branch
 * 349 on one seed and branch 71 on another, so the useful range is roughly
 * 20-150 rather than the bird's 5-25, and a curve tuned for the bird would
 * have paid the cap to anybody who could hold a direction.
 */
export const TREE_CLIMB_CURVE: RewardCurve = { cap: 55n, half: 55n };

/**
 * A worked example of the curve, for the balance docs and for anybody
 * wondering whether the hundredth gate is worth chasing. It is not, and
 * that is the design.
 *
 *   The Paper Bird (cap 55, half 16)
 *     3 gates  →  8      20 gates → 30
 *     6 gates  → 15      40 gates → 39
 *    10 gates  → 21     100 gates → 47
 *
 *   The Long Way Up (cap 55, half 55)
 *    10 branches →  8    80 branches → 32
 *    30 branches → 19   150 branches → 40
 *    55 branches → 27   350 branches → 47
 *
 * Doubling 20 gates to 40 adds nine coins. Doubling again adds five. There
 * is a point past which you are playing because you want to, which is the
 * only reason worth playing an endless game.
 */
export const CURVE_EXAMPLE_SCORES = [3, 6, 10, 20, 40, 100] as const;
