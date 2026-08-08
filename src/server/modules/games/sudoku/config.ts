import type { DbClient } from "@/server/db";
import { enforceRateLimit, type RateLimitRule } from "@/server/security/rate-limit";

/** The slate is chalked at medium and nothing else (ADR-51). */
export const SUDOKU_DIFFICULTY = "medium";

/**
 * One grid a day for everybody means one slate. The puzzle is keyed by
 * game date alone, so a second attachment would render the same grid in
 * two places and let a player "finish" it twice in the interface while
 * the payout guard silently refused the second. Validated offline.
 */
export const SUDOKU_ACTIVITY_KEY = "the-morning-slate";

/**
 * Coins for solving the day's grid, once per player per game day.
 *
 * Flat rather than scaled by time or by how few checks it took. The game
 * never ranks one player against another, and a reward that paid more for
 * being fast would make a quiet morning puzzle into a race against people
 * you cannot see.
 */
export const SUDOKU_REWARD = 420n;

const RULES = {
  // Typing a digit writes to the server, so this is the busy one. A
  // person filling a grid at speed touches maybe one cell a second.
  entry: { name: "sudoku-entry", limit: 180, windowSeconds: 60 },
  check: { name: "sudoku-check", limit: 30, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export type SudokuRateLimitedOperation = keyof typeof RULES;

export async function enforceSudokuRateLimit(
  db: DbClient,
  operation: SudokuRateLimitedOperation,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await enforceRateLimit(db, RULES[operation], userId, { userId, now });
}
