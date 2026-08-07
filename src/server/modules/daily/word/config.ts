import type { WordDifficulty } from "@prisma/client";
import type { GameDate } from "../game-day";

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
 * The UTC game date whose puzzles use each difficulty's answer at
 * sequence position 0. Every later game day advances each rotation by
 * one, wrapping after the last active answer. Fixed and documented —
 * changing it re-times every future (but no frozen) puzzle.
 */
export const WORD_ROTATION_EPOCH: GameDate = "2026-01-01";

/**
 * Stable content key for the daily word activity attachment. The word
 * challenge is a single global activity (one rotation shared by all
 * players), so there is exactly one key.
 */
export const DAILY_WORD_ACTIVITY_KEY = "daily-word-main";
