import { Prisma } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { coinsToJSON } from "@/lib/money";
import {
  EMPTY_GRID,
  isComplete,
  isGridShape,
  withGivens,
} from "@/lib/games/sudoku-grid";
import { SUDOKU_REWARD, enforceSudokuRateLimit } from "./config";
import { ensurePuzzle } from "./puzzle";
import { SudokuError } from "./puzzle";

/**
 * One player's work on one day's grid (ADR-51).
 *
 * The security model is small because the attack surface is: the client
 * submits an 81-character entry string, and `withGivens` re-imposes the
 * puzzle's own clues over it before anything is stored or judged. A forged
 * digit in a given cell is therefore discarded rather than rejected — the
 * only cells a browser can actually change are the blanks, which is
 * exactly the authority a player has sitting in front of a real slate.
 *
 * The server adjudicates completion and NOTHING ELSE. It will say the grid
 * is not right yet; it will never say which cell is wrong, because "which
 * cell" is the solution handed over one call at a time. Conflict
 * highlighting is pure client-side arithmetic that needs no solution
 * (src/lib/games/sudoku-grid.ts), which is what keeps that restraint from
 * costing the player anything.
 */

export interface SudokuView {
  gameDate: GameDate;
  /** 81 chars, '.' for a blank. */
  givens: string;
  /** The player's own entries, givens included. */
  grid: string;
  solved: boolean;
  wrongChecks: number;
  /** Whole seconds taken, once solved. Private to this player. */
  solveSeconds: number | null;
  /** Serialized coins this grid paid. "0" until solved. */
  coins: string;
  /** Serialized coins a solve pays, for the panel before it is solved. */
  rewardJson: string;
  /** The player's own best time, ever. Never compared to anyone. */
  personalBestSeconds: number | null;
}

function viewOf(
  puzzle: { gameDate: string; givens: string },
  attempt: {
    entries: string;
    status: string;
    wrongChecks: number;
    solveSeconds: number | null;
    coins: bigint;
  } | null,
  personalBestSeconds: number | null,
): SudokuView {
  return {
    gameDate: puzzle.gameDate as GameDate,
    givens: puzzle.givens,
    grid: withGivens(puzzle.givens, attempt?.entries ?? EMPTY_GRID),
    solved: attempt?.status === "SOLVED",
    wrongChecks: attempt?.wrongChecks ?? 0,
    solveSeconds: attempt?.solveSeconds ?? null,
    coins: coinsToJSON(attempt?.coins ?? 0n),
    rewardJson: coinsToJSON(SUDOKU_REWARD),
    personalBestSeconds,
  };
}

/**
 * The player's own fastest solve, ever.
 *
 * Read from their own rows and shown only to them (CLAUDE.md: personal
 * records are private, and the game never ranks one player against
 * another). There is no query anywhere that reads anybody else's.
 */
async function personalBest(
  db: DbReader,
  userId: string,
): Promise<number | null> {
  const best = await db.sudokuAttempt.findFirst({
    where: { userId, status: "SOLVED", solveSeconds: { not: null } },
    orderBy: { solveSeconds: "asc" },
    select: { solveSeconds: true },
  });
  return best?.solveSeconds ?? null;
}

/** Today's grid and this player's progress on it, starting an attempt if needed. */
export async function getSudokuView(
  db: DbClient,
  {
    userId,
    clock = systemClock,
  }: { userId: string; clock?: Clock },
): Promise<SudokuView> {
  const gameDate = currentGameDate(clock);
  const puzzle = await ensurePuzzle(db, gameDate);
  const attempt = await db.sudokuAttempt.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
  });
  return viewOf(puzzle, attempt, await personalBest(db, userId));
}

/**
 * Saves the player's working.
 *
 * The whole grid comes up on every save rather than a single cell: the
 * grid is 81 bytes, the givens are re-imposed anyway, and a per-cell patch
 * protocol would need its own ordering rules for no benefit at all.
 *
 * A solved grid is immutable. Nothing is lost by refusing the write —
 * the payout already happened and the grid is already correct.
 */
export async function saveEntries(
  db: DbClient,
  {
    userId,
    entries,
    clock = systemClock,
  }: { userId: string; entries: string; clock?: Clock },
): Promise<SudokuView> {
  await enforceSudokuRateLimit(db, "entry", userId, clock.now());
  if (!isGridShape(entries)) {
    throw new SudokuError("INVALID_GRID", "That isn't a grid.");
  }
  const gameDate = currentGameDate(clock);
  const puzzle = await ensurePuzzle(db, gameDate);
  // Givens win over anything the client sent for those cells.
  const kept = withGivens(puzzle.givens, entries);

  const existing = await db.sudokuAttempt.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
  });
  if (existing?.status === "SOLVED") {
    return viewOf(puzzle, existing, await personalBest(db, userId));
  }
  if (!existing) {
    try {
      const created = await db.sudokuAttempt.create({
        data: { userId, gameDate, entries: kept, startedAt: clock.now() },
      });
      return viewOf(puzzle, created, await personalBest(db, userId));
    } catch (error) {
      // Two tabs opened the slate at once. Fall through to the update.
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
      ) {
        throw error;
      }
    }
  }
  // Guarded on not-yet-solved, so a save racing a solve cannot overwrite
  // the finished grid.
  await db.sudokuAttempt.updateMany({
    where: { userId, gameDate, status: "IN_PROGRESS" },
    data: { entries: kept },
  });
  const after = await db.sudokuAttempt.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
  });
  return viewOf(puzzle, after, await personalBest(db, userId));
}

export interface CheckResult {
  view: SudokuView;
  /** True only when this call was the one that solved it. */
  justSolved: boolean;
  /** Set when the grid was full but wrong. */
  wrong: boolean;
  /** Serialized coins paid by this call; "0" otherwise. */
  coinsAwarded: string;
}

/**
 * Judges a completed grid.
 *
 * Refuses to judge an incomplete one rather than reporting "not right
 * yet": a half-filled grid is not wrong, and telling a player it is would
 * be both untrue and discouraging.
 *
 * The payout is guarded by a status transition rather than counted, so two
 * submissions racing cannot both pay — the loser's `updateMany` matches
 * nothing and it reports the solve without a second reward.
 */
export async function checkGrid(
  db: DbClient,
  {
    userId,
    entries,
    clock = systemClock,
  }: { userId: string; entries: string; clock?: Clock },
): Promise<CheckResult> {
  await enforceSudokuRateLimit(db, "check", userId, clock.now());
  if (!isGridShape(entries)) {
    throw new SudokuError("INVALID_GRID", "That isn't a grid.");
  }
  const now = clock.now();
  const gameDate = currentGameDate(clock);
  await ensurePuzzle(db, gameDate);

  // The solution is read here and never leaves this function.
  const puzzle = await db.sudokuPuzzle.findUniqueOrThrow({
    where: { gameDate },
  });
  const kept = withGivens(puzzle.givens, entries);

  if (!isComplete(kept)) {
    const view = await saveEntries(db, { userId, entries: kept, clock });
    return { view, justSolved: false, wrong: false, coinsAwarded: "0" };
  }

  const correct = kept === puzzle.solution;
  if (!correct) {
    await saveEntries(db, { userId, entries: kept, clock });
    await db.sudokuAttempt.updateMany({
      where: { userId, gameDate, status: "IN_PROGRESS" },
      data: { wrongChecks: { increment: 1 } },
    });
    const view = await getSudokuView(db, { userId, clock });
    return { view, justSolved: false, wrong: true, coinsAwarded: "0" };
  }

  // Correct. Make sure a row exists to transition, then pay under a guard.
  await saveEntries(db, { userId, entries: kept, clock });
  const attempt = await db.sudokuAttempt.findUniqueOrThrow({
    where: { userId_gameDate: { userId, gameDate } },
  });
  const seconds = Math.max(
    0,
    Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000),
  );

  const paid = await db.$transaction(async (tx) => {
    // The transition IS the idempotency: only one caller can move this row
    // out of IN_PROGRESS, and only that caller pays.
    const won = await tx.sudokuAttempt.updateMany({
      where: { userId, gameDate, status: "IN_PROGRESS" },
      data: {
        status: "SOLVED",
        solvedAt: now,
        solveSeconds: seconds,
        entries: kept,
      },
    });
    if (won.count === 0) {
      return 0n;
    }
    const ledger = await recordLedger(tx, {
      userId,
      type: "SUDOKU_REWARD",
      coinsDelta: SUDOKU_REWARD,
      note: `Finished the slate for ${gameDate}`,
      metadata: { gameDate, seconds },
    });
    await creditCoins(tx, { userId, amount: SUDOKU_REWARD });
    await tx.sudokuAttempt.updateMany({
      where: { userId, gameDate },
      data: { coins: SUDOKU_REWARD, transactionId: ledger.id },
    });
    return SUDOKU_REWARD;
  });

  log.info("sudoku.solved", {
    userId,
    gameDate,
    seconds,
    wrongChecks: attempt.wrongChecks,
    coins: coinsToJSON(paid),
  });
  const view = await getSudokuView(db, { userId, clock });
  return {
    view,
    justSolved: paid > 0n,
    wrong: false,
    coinsAwarded: coinsToJSON(paid),
  };
}
