import type { DbReader } from "@/server/db";
import { withGivens } from "@/lib/games/sudoku-grid";
import type { GameDate } from "@/server/modules/daily/game-day";

/**
 * Read-only projections of the slate, for surfaces that must not chalk it.
 *
 * The activity directory renders on the home page and on /games, and
 * neither is a reason to generate a puzzle: a player who never visits
 * Tarnreach should not be causing grids to be written. So this reads what
 * exists and reports "not started" when nothing does, rather than calling
 * `ensurePuzzle`. The location page is what chalks the slate.
 */

export interface SudokuDirectoryEntry {
  started: boolean;
  solved: boolean;
  /** Blanks the player has filled, and how many there were. */
  filled: number;
  blanks: number;
}

export async function getSudokuDirectoryEntry(
  db: DbReader,
  { userId, gameDate }: { userId: string; gameDate: GameDate },
): Promise<SudokuDirectoryEntry> {
  const puzzle = await db.sudokuPuzzle.findUnique({
    where: { gameDate },
    select: { givens: true },
  });
  if (!puzzle) {
    return { started: false, solved: false, filled: 0, blanks: 0 };
  }
  const attempt = await db.sudokuAttempt.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
    select: { entries: true, status: true },
  });
  const blanks = [...puzzle.givens].filter((cell) => cell === ".").length;
  if (!attempt) {
    return { started: false, solved: false, filled: 0, blanks };
  }
  const grid = withGivens(puzzle.givens, attempt.entries);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) {
    if (puzzle.givens[i] === "." && grid[i] !== ".") filled++;
  }
  return {
    started: filled > 0,
    solved: attempt.status === "SOLVED",
    filled,
    blanks,
  };
}
