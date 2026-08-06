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

export const DIFFICULTY_CONFIG: Record<WordDifficulty, DifficultyConfig> = {
  EASY: { length: 4, maxGuesses: 5, rewardCoins: 100n },
  MEDIUM: { length: 5, maxGuesses: 5, rewardCoins: 250n },
  HARD: { length: 6, maxGuesses: 5, rewardCoins: 500n },
};

export const WORD_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

/** Recorded on each puzzle so pool changes never silently re-derive answers. */
export const GENERATION_VERSION = 1;

/**
 * Answers used within this many prior game days are excluded from selection
 * when the remaining pool permits it.
 */
export const RECENT_ANSWER_EXCLUSION_DAYS = 45;
