/**
 * Matching game rules. PURE — no database, no crypto, no server imports.
 *
 * Shared by the server (which adjudicates) and the client (which renders
 * what it has been told). The board itself is NEVER in here: this module
 * knows how to replay a flip log against a layout it is handed, and the
 * layout only ever exists server-side.
 */

export const MATCHING_DIFFICULTIES = ["GENTLE", "BRISK", "DEEP"] as const;
export type MatchingDifficulty = (typeof MATCHING_DIFFICULTIES)[number];

export interface DifficultyConfig {
  /** Distinct pairs on the table. Cards = pairs × 2. */
  pairs: number;
  /** Columns, for the grid. Rows fall out of pairs × 2 / columns. */
  columns: number;
  /**
   * Flips allowed before the run ends. Generous: the point is a pleasant
   * few minutes, and a board you cannot finish is a board you resent.
   * Perfect play needs `pairs × 2`; this is comfortably above it.
   */
  flipBudget: number;
  /** Coins for finishing, and the bonus for doing it inside par. */
  reward: bigint;
  parBonus: bigint;
  /**
   * Flips at or under which the bonus is paid. Set from the arithmetic of
   * the game rather than by feel: a player who remembers everything they
   * have seen needs about 3 flips per pair on a cold board.
   */
  par: number;
}

/**
 * Three sizes, and the reward ladder across them.
 *
 * The ceiling matters more than the floor. The whole board pays once per
 * difficulty per day (see MatchingPayout), so a player can sit with this
 * for an hour because they like it and the economy never notices —
 * exactly the property that lets the Sorting Bench be unlimited. Totals
 * (reward + bonus) are 40 / 95 / 190, which puts a full sweep of all
 * three below the word puzzle's 210 and keeps ADR-33's ordering intact.
 */
export const MATCHING_CONFIG: Record<MatchingDifficulty, DifficultyConfig> = {
  GENTLE: { pairs: 6, columns: 4, flipBudget: 40, reward: 25n, parBonus: 15n, par: 18 },
  BRISK: { pairs: 10, columns: 4, flipBudget: 70, reward: 60n, parBonus: 35n, par: 32 },
  DEEP: { pairs: 15, columns: 5, flipBudget: 110, reward: 120n, parBonus: 70n, par: 50 },
};

export interface ReplayOutcome {
  /** Card indices whose pair has been found; they stay face up. */
  matched: number[];
  /**
   * The cards currently turned over and not yet resolved: zero or one.
   * Two never persists — the second flip resolves the turn immediately.
   */
  faceUp: number[];
  flipsUsed: number;
  pairsFound: number;
  /** True once every pair is found. */
  complete: boolean;
  /** True when a flip in the log was illegal (see below). */
  illegal: boolean;
}

/**
 * Replays a flip log against a layout.
 *
 * `layout[i]` is the pair id under card `i`. A flip is illegal if it names
 * a card outside the board, a card already matched, or the card currently
 * face up — all three are things a legitimate client cannot do, so the run
 * is voided rather than repaired. Repairing would mean guessing at intent,
 * and a game that guesses is a game that can be nudged.
 */
export function replayFlips(
  layout: readonly number[],
  flips: readonly number[],
): ReplayOutcome {
  const matched = new Set<number>();
  let faceUp: number | null = null;
  let flipsUsed = 0;

  for (const card of flips) {
    if (!Number.isInteger(card) || card < 0 || card >= layout.length) {
      return outcome(matched, faceUp, flipsUsed, layout.length, true);
    }
    if (matched.has(card) || faceUp === card) {
      return outcome(matched, faceUp, flipsUsed, layout.length, true);
    }
    flipsUsed += 1;
    if (faceUp === null) {
      faceUp = card;
      continue;
    }
    if (layout[faceUp] === layout[card]) {
      matched.add(faceUp);
      matched.add(card);
    }
    // Matched or not, the turn resolves and the table goes face down.
    faceUp = null;
  }
  return outcome(matched, faceUp, flipsUsed, layout.length, false);
}

function outcome(
  matched: Set<number>,
  faceUp: number | null,
  flipsUsed: number,
  cards: number,
  illegal: boolean,
): ReplayOutcome {
  return {
    matched: [...matched].sort((a, b) => a - b),
    faceUp: faceUp === null ? [] : [faceUp],
    flipsUsed,
    pairsFound: matched.size / 2,
    complete: matched.size === cards,
    illegal,
  };
}

/** Coins a completed run is worth, before the once-per-day rule. */
export function rewardFor(
  difficulty: MatchingDifficulty,
  flipsUsed: number,
): bigint {
  const config = MATCHING_CONFIG[difficulty];
  return flipsUsed <= config.par
    ? config.reward + config.parBonus
    : config.reward;
}
