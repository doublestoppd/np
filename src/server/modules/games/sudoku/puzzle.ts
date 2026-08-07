import { Prisma } from "@prisma/client";
import { analyze, generate, solve } from "sudoku-core";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { isGridShape } from "@/lib/games/sudoku-grid";
import type { GameDate } from "@/server/modules/daily/game-day";
import { assertGameDate } from "@/server/modules/daily/game-day";
import { SUDOKU_DIFFICULTY } from "./config";

/**
 * The one grid everybody works today (ADR-51).
 *
 * `sudoku-core` (MIT, no dependencies) does the generating, solving, and
 * difficulty grading. Writing a generator that guarantees a unique
 * solution AND lands reliably on a target difficulty is a solver plus a
 * rater plus a hole-punching search, and none of that is this game.
 *
 * **The generator is not seedable, so "the same for everyone" is
 * guaranteed by there being exactly one row rather than by hoping two
 * runs agree.** The first player to look on a given date generates the
 * grid and writes it; everyone else — and every later request from that
 * player — reads it back. The write races under the primary key, and the
 * loser re-reads the winner's row, so a thundering herd at midnight
 * settles into one puzzle rather than 200.
 *
 * `solution` is SERVER ONLY. Nothing in this module returns it, and the
 * view models in ./queries.ts have nowhere to put it.
 */

export class SudokuError extends DomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "SudokuError";
  }
}

/** How many attempts to make before giving up on hitting the target grade. */
const GRADE_ATTEMPTS = 12;

type Cell = number | null;

function toGivens(board: readonly Cell[]): string {
  return board.map((cell) => (cell === null ? "." : String(cell))).join("");
}

/**
 * Generates one medium grid with a unique solution.
 *
 * The library's grader is consulted rather than trusted blind: a board is
 * only accepted if it reports the target difficulty AND a unique solution,
 * and the loop tries again otherwise. After GRADE_ATTEMPTS it takes the
 * last uniquely-solvable board whatever its grade — a slate that is a
 * shade easy beats no slate at all, and the grade is recorded on the row
 * so an operator can see it happened.
 */
function generateGrid(): { givens: string; solution: string; difficulty: string } {
  let fallback: { givens: string; solution: string; difficulty: string } | null =
    null;

  for (let attempt = 0; attempt < GRADE_ATTEMPTS; attempt++) {
    const board = generate(SUDOKU_DIFFICULTY);
    const analysis = analyze(board);
    if (!analysis.hasUniqueSolution) {
      continue;
    }
    const solved = solve(board);
    if (!solved.solved || !solved.board) {
      continue;
    }
    const givens = toGivens(board);
    const solution = solved.board
      .map((cell) => (cell === null ? "." : String(cell)))
      .join("");
    // Shape is checked here rather than assumed: everything downstream
    // indexes into these strings, and the CHECK constraints would only
    // catch it at the write.
    if (!isGridShape(givens) || !/^[1-9]{81}$/.test(solution)) {
      continue;
    }
    // The grader returns undefined when it cannot place a board on its
    // ladder. That is not a medium grid, so it is recorded honestly as
    // "ungraded" rather than being quietly relabelled.
    const candidate = {
      givens,
      solution,
      difficulty: analysis.difficulty ?? "ungraded",
    };
    if (analysis.difficulty === SUDOKU_DIFFICULTY) {
      return candidate;
    }
    fallback = candidate;
  }

  if (fallback) {
    log.warn("sudoku.grade-missed", {
      wanted: SUDOKU_DIFFICULTY,
      got: fallback.difficulty,
      attempts: GRADE_ATTEMPTS,
    });
    return fallback;
  }
  throw new SudokuError(
    "PUZZLE_UNAVAILABLE",
    "Today's slate hasn't been chalked yet. Try again in a moment.",
  );
}

export interface DailyPuzzle {
  gameDate: GameDate;
  givens: string;
  difficulty: string;
}

/**
 * Today's grid, generating it once if this is the first look.
 *
 * Returns the givens and never the solution. Callers that need to
 * adjudicate read the solution themselves, inside their transaction.
 */
export async function ensurePuzzle(
  db: DbClient,
  gameDate: GameDate,
): Promise<DailyPuzzle> {
  assertGameDate(gameDate);
  const existing = await db.sudokuPuzzle.findUnique({ where: { gameDate } });
  if (existing) {
    return {
      gameDate,
      givens: existing.givens,
      difficulty: existing.difficulty,
    };
  }

  const generated = generateGrid();
  try {
    const created = await db.sudokuPuzzle.create({
      data: { gameDate, ...generated },
    });
    log.info("sudoku.puzzle-created", {
      gameDate,
      difficulty: created.difficulty,
      givens: created.givens.replace(/[1-9]/g, "#").length,
    });
    return {
      gameDate,
      givens: created.givens,
      difficulty: created.difficulty,
    };
  } catch (error) {
    // Somebody else chalked it first. Their grid is the grid — discarding
    // ours is the entire point of the constraint.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await db.sudokuPuzzle.findUniqueOrThrow({
        where: { gameDate },
      });
      return {
        gameDate,
        givens: winner.givens,
        difficulty: winner.difficulty,
      };
    }
    throw error;
  }
}
