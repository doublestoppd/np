import type { WordDifficulty } from "@prisma/client";

/**
 * Daily word challenge configuration. Rewards are data-configurable: these
 * are the defaults snapshotted onto each puzzle row at creation; operators
 * change future game dates via the admin CLI (puzzle:set-reward), which
 * edits unplayed puzzle rows — never history.
 */
export interface DifficultyConfig {
  length: number;
  maxGuesses: number;
  rewardCoins: bigint;
}

/**
 * Rewards are deliberately modest (ADR-33). At 100/250/500 the three
 * puzzles paid 850 coins a day — roughly fourteen times the cost of
 * feeding a companion, and about ninety-three percent of every coin in
 * the game. That made shop prices, the market, and the estimated value
 * printed beside every item decorative, and it made the game's most
 * effortful activity, the request board, worth a rounding error beside
 * its least. Typing three words is a pleasant minute; it should not be
 * the economy.
 */
export const DIFFICULTY_CONFIG: Record<WordDifficulty, DifficultyConfig> = {
  EASY: { length: 4, maxGuesses: 5, rewardCoins: 30n },
  MEDIUM: { length: 5, maxGuesses: 5, rewardCoins: 60n },
  HARD: { length: 6, maxGuesses: 5, rewardCoins: 120n },
};

export const WORD_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

/**
 * How many independent answer rotations run at once.
 *
 * Every player belongs to exactly one band, derived from their user id
 * (rotation.ts), and each band gets its own answer per day. This is what
 * makes a leaked answer worth one band instead of the whole player base:
 * an attacker must burn a sacrifice account *per band, per day*, and
 * because a band's answer is keyed by a server secret rather than
 * computed, yesterday's mapping buys them nothing today.
 *
 * 32 is chosen against the cost, not plucked: it is 32× the farming cost
 * for 96 puzzle rows a day (~35k a year, trivial), and it stays well
 * under the smallest answer pool (100 per difficulty) so bands can differ.
 * Raising it later is safe — bands are derived, never stored, so existing
 * accounts simply redistribute, and frozen puzzle rows are untouched.
 */
export const WORD_BANDS = 32;

/**
 * Secret keying the band→answer mapping.
 *
 * Production must set `WORD_ROTATION_SECRET`; the fallback is a known
 * development value and `validateServerConfig` refuses to start production
 * with it, the same treatment `RESTOCK_SEED_SECRET` gets. Rotating it
 * changes only future puzzles — existing rows are frozen by their
 * `answerId`, so history and in-flight boards are never rewritten.
 */
export function wordRotationSecret(): string {
  return process.env.WORD_ROTATION_SECRET ?? "dev-only-word-rotation";
}

/**
 * Stable content key for the daily word activity attachment. There is one
 * word challenge in the world; the per-band rotation is invisible to
 * content and to the map, so there is still exactly one key.
 */
export const DAILY_WORD_ACTIVITY_KEY = "daily-word-main";
