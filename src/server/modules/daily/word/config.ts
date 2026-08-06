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

export const DIFFICULTY_CONFIG: Record<WordDifficulty, DifficultyConfig> = {
  EASY: { length: 4, maxGuesses: 5, rewardCoins: 100n },
  MEDIUM: { length: 5, maxGuesses: 5, rewardCoins: 250n },
  HARD: { length: 6, maxGuesses: 5, rewardCoins: 500n },
};

export const WORD_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

/**
 * The UTC game date whose puzzles use each difficulty's answer at
 * sequence position 0. Every later game day advances each rotation by
 * one, wrapping after the last active answer. Fixed and documented —
 * changing it re-times every future (but no frozen) puzzle.
 */
export const WORD_ROTATION_EPOCH: GameDate = "2026-01-01";
