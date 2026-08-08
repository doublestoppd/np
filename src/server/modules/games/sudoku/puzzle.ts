import { analyze, generate, solve } from "sudoku-core";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { DomainError } from "@/server/errors";
import { isGridShape } from "@/lib/games/sudoku-grid";
import type { GameDate } from "@/server/modules/daily/game-day";
import { assertGameDate } from "@/server/modules/daily/game-day";
import { ROTATION_BANDS } from "@/server/modules/daily/bands";
import { SUDOKU_DIFFICULTY } from "./config";

/**
 * The grid a band works today (ADR-51, amended by ADR-53).
 *
 * `sudoku-core` (MIT, no dependencies) does the generating, solving, and
 * difficulty grading. Writing a generator that guarantees a unique
 * solution AND lands reliably on a target difficulty is a solver plus a
 * rater plus a hole-punching search, and none of that is this game.
 *
 * **Banded, like the word puzzle and the lantern hunt** (modules/daily/
 * bands.ts). It shipped as one global grid, which made the largest daily
 * reward in the game free to anyone who read a posted solution — 81
 * characters, the whole answer, nothing to interpret. There are now
 * ROTATION_BANDS grids per date and a player's band comes from their user
 * id, so a leaked grid is wrong for the other 31/32 of the player base.
 *
 * **The generator is not seedable, so "the same for everyone in a band" is
 * guaranteed by there being exactly one row per (date, band) rather than
 * by hoping two runs agree.** The cron pre-chalks every band for today and
 * tomorrow, and this is the fallback for a cold one: the first player to
 * look takes an advisory lock, generates, and writes; everyone else in
 * that band waits on the lock and reads the winner's row without ever
 * calling the generator.
 *
 * The lock is not an optimisation. Generation is a synchronous CPU-bound
 * search that blocks the event loop, so racing on the unique constraint
 * alone made the data correct and the SERVER unusable — twenty
 * simultaneous first-visitors froze every unrelated page for ten seconds.
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
  band: number;
  givens: string;
  difficulty: string;
}

/**
 * This band's grid for the date, generating it once if this is the first
 * look.
 *
 * Returns the givens and never the solution. Callers that need to
 * adjudicate read the solution themselves, inside their transaction.
 */
export async function ensurePuzzle(
  db: DbClient,
  gameDate: GameDate,
  band: number,
): Promise<DailyPuzzle> {
  assertGameDate(gameDate);
  assertBand(band);
  const existing = await db.sudokuPuzzle.findUnique({
    where: { gameDate_band: { gameDate, band } },
  });
  if (existing) {
    return {
      gameDate,
      band,
      givens: existing.givens,
      difficulty: existing.difficulty,
    };
  }

  /**
   * Only one request generates. The rest wait on the lock and read.
   *
   * This is the difference between a cold slate costing ~900ms of CPU once
   * and costing it N times: generation is a synchronous CPU-bound search
   * that blocks the Node event loop, so twenty simultaneous first-visitors
   * at 00:00 UTC took ten seconds — and took every UNRELATED page on the
   * server down with them for the duration, because none of them could be
   * served either. Racing on the unique constraint alone made the *data*
   * correct and the server unusable.
   *
   * A transaction-scoped advisory lock (`pg_advisory_xact_lock`) is the
   * fallback docs/conventions.md names for an invariant that spans rows
   * with no single row to guard. It releases on commit or rollback, so a
   * generation that throws cannot wedge the next caller. The double-check
   * inside the lock is what makes the waiters cheap: by the time they
   * acquire it, the winner's row is there and they never call the
   * generator at all.
   *
   * The lock key is derived from the date so two different days never
   * block each other.
   */
  const lockKey = lockKeyFor(gameDate, band);
  const row = await db.$transaction(async (tx) => {
    // $executeRaw, not $queryRaw: the function returns void, which has
    // no Prisma type to deserialize into.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;
    const winner = await tx.sudokuPuzzle.findUnique({
      where: { gameDate_band: { gameDate, band } },
    });
    if (winner) {
      return winner;
    }
    const generated = generateGrid();
    const created = await tx.sudokuPuzzle.create({
      data: { gameDate, band, ...generated },
    });
    log.info("sudoku.puzzle-created", {
      gameDate,
      band,
      difficulty: created.difficulty,
      blanks: [...created.givens].filter((cell) => cell === ".").length,
    });
    return created;
  });

  return {
    gameDate,
    band,
    givens: row.givens,
    difficulty: row.difficulty,
  };
}

/**
 * Chalks every band's grid for a date. Called by the scheduler.
 *
 * **Sequential on purpose.** Generation is a synchronous CPU-bound search
 * that blocks the event loop, so running 32 of them concurrently would not
 * be faster — it would be the same total CPU with the server unable to
 * serve anything for the duration. One at a time leaves the loop free
 * between grids.
 *
 * Each band takes its own lock, so a band the cron has already chalked
 * costs one indexed read, and a player who arrives mid-run for a band that
 * is not done yet waits only for their own grid.
 */
export async function ensureDailyPuzzles(
  db: DbClient,
  gameDate: GameDate,
): Promise<number> {
  let generated = 0;
  for (let band = 0; band < ROTATION_BANDS; band++) {
    const before = await db.sudokuPuzzle.count({
      where: { gameDate, band },
    });
    await ensurePuzzle(db, gameDate, band);
    if (before === 0) {
      generated++;
    }
  }
  return generated;
}

function assertBand(band: number): void {
  if (!Number.isInteger(band) || band < 0 || band >= ROTATION_BANDS) {
    throw new SudokuError(
      "BAD_BAND",
      "Today's slate hasn't been chalked yet. Try again in a moment.",
    );
  }
}

/**
 * A stable 63-bit advisory lock key for one band's grid on one date.
 *
 * Advisory locks share one global namespace, so the key has to be
 * unlikely to collide with anything else that ever takes one. The prefix
 * is arbitrary and only has to be ours. The band is folded in so two bands
 * generating at once do not queue behind each other — they are different
 * grids and there is no invariant between them.
 */
function lockKeyFor(gameDate: GameDate, band: number): bigint {
  const digits = gameDate.replace(/-/g, "");
  return 7_310_000_000_000n + BigInt(digits) * BigInt(ROTATION_BANDS) + BigInt(band);
}
