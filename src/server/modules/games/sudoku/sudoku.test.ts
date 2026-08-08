/**
 * The Morning Slate: one grid a day for everybody, and the restraint that
 * keeps the server from handing over the answer a cell at a time (ADR-51).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { checkGrid, getSudokuView, saveEntries } from "./attempt";
import { ensurePuzzle } from "./puzzle";
import { getSudokuDirectoryEntry } from "./queries";
import { SUDOKU_REWARD } from "./config";
import {
  EMPTY_GRID,
  boxOf,
  columnOf,
  conflictingCells,
  isComplete,
  isGridShape,
  rowOf,
  withGivens,
} from "@/lib/games/sudoku-grid";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { runConcurrently } from "@test/helpers/concurrency";
import { FixedClock } from "@test/helpers/clock";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

const prefix = fixturePrefix("sudoku");

describe("sudoku grid arithmetic (pure)", () => {
  it("indexes rows, columns, and boxes the way a person reads a grid", () => {
    expect(rowOf(0)).toBe(0);
    expect(columnOf(0)).toBe(0);
    expect(boxOf(0)).toBe(0);
    expect(boxOf(8)).toBe(2);
    expect(boxOf(80)).toBe(8);
    expect(boxOf(40)).toBe(4);
    // Every cell lands in exactly one box, and each box holds nine.
    const counts = new Map<number, number>();
    for (let i = 0; i < 81; i++) {
      counts.set(boxOf(i), (counts.get(boxOf(i)) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual(Array(9).fill(9));
  });

  it("flags both halves of a clash, not just the newer one", () => {
    // Two 5s in the top row.
    const grid = "5...5" + ".".repeat(76);
    expect(conflictingCells(grid)).toEqual([0, 4]);
  });

  it("finds no conflict in a grid that merely has blanks", () => {
    expect(conflictingCells(EMPTY_GRID)).toEqual([]);
    expect(isComplete(EMPTY_GRID)).toBe(false);
    expect(isGridShape(EMPTY_GRID)).toBe(true);
  });

  /**
   * The load-bearing one: a forged digit over a given cell is silently
   * discarded, so the only thing a browser can change is a blank. Every
   * server path runs entries through this before storing or judging them.
   */
  it("re-imposes the givens over anything the client sent", () => {
    const givens = "12." + ".".repeat(78);
    const forged = "999" + "8".repeat(78);
    const kept = withGivens(givens, forged);
    expect(kept.slice(0, 3)).toBe("129");
    expect(kept.slice(3)).toBe("8".repeat(78));
  });

  it("rejects anything that is not 81 cells of digits and dots", () => {
    expect(isGridShape("")).toBe(false);
    expect(isGridShape("1".repeat(80))).toBe(false);
    expect(isGridShape("1".repeat(82))).toBe(false);
    expect(isGridShape("0".repeat(81))).toBe(false);
    expect(isGridShape("x".repeat(81))).toBe(false);
    expect(isGridShape("1".repeat(81))).toBe(true);
  });
});

describe.skipIf(!testDb)("the morning slate (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let otherId: string;

  /** A fixed day per test file run, so fixtures never collide with a real one. */
  const clock = new FixedClock(new Date("2099-05-05T09:00:00Z"));
  const gameDate = currentGameDate(clock);

  // Chalks the grid if no earlier test in this file happened to. A helper
  // that depends on test ordering fails differently depending on which
  // subset you run, which is the least useful kind of failure.
  async function solutionFor(): Promise<string> {
    await ensurePuzzle(db, gameDate);
    const row = await db.sudokuPuzzle.findUniqueOrThrow({ where: { gameDate } });
    return row.solution;
  }

  beforeEach(async () => {
    await db.sudokuAttempt.deleteMany({ where: { gameDate } });
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;
    otherId = (
      await createTestUser(db, { username: `${prefix}_b_${randomUUID().slice(0, 8)}` })
    ).id;
  });

  afterAll(async () => {
    await db.sudokuAttempt.deleteMany({ where: { gameDate } });
    await db.sudokuPuzzle.deleteMany({ where: { gameDate } });
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  it("chalks a medium grid with a unique solution", { timeout: 30_000 }, async () => {
    const puzzle = await ensurePuzzle(db, gameDate);
    expect(isGridShape(puzzle.givens)).toBe(true);
    expect(puzzle.difficulty).toBe("medium");

    const row = await db.sudokuPuzzle.findUniqueOrThrow({ where: { gameDate } });
    expect(row.solution).toMatch(/^[1-9]{81}$/);
    // The solution really is a solution of the givens.
    expect(withGivens(puzzle.givens, row.solution)).toBe(row.solution);
    expect(conflictingCells(row.solution)).toEqual([]);
    // A medium grid leaves a real amount of work.
    const blanks = [...puzzle.givens].filter((cell) => cell === ".").length;
    expect(blanks).toBeGreaterThan(30);
  });

  /**
   * "The same for everyone" is guaranteed by there being exactly one row,
   * not by hoping two generator runs agree — the generator is not seedable.
   */
  // Four concurrent cold generations, each a CPU-bound search. It is
  // genuinely slow, and slower again on a loaded machine running the rest
  // of the suite in parallel — so this gets room rather than a flake.
  it("gives every player the same grid, even from a thundering herd", { timeout: 30_000 }, async () => {
    await db.sudokuPuzzle.deleteMany({ where: { gameDate } });
    const race = await runConcurrently([
      () => ensurePuzzle(db, gameDate),
      () => ensurePuzzle(db, gameDate),
      () => ensurePuzzle(db, gameDate),
      () => ensurePuzzle(db, gameDate),
    ]);
    expect(race.rejected).toHaveLength(0);
    const givens = new Set(race.fulfilled.map((p) => p.givens));
    expect(givens.size).toBe(1);
    expect(await db.sudokuPuzzle.count({ where: { gameDate } })).toBe(1);

    const mine = await getSudokuView(db, { userId, clock });
    const theirs = await getSudokuView(db, { userId: otherId, clock });
    expect(mine.givens).toBe(theirs.givens);
  });

  it("saves working so a closed tab loses nothing", async () => {
    const puzzle = await ensurePuzzle(db, gameDate);
    const firstBlank = puzzle.givens.indexOf(".");
    const entries =
      EMPTY_GRID.slice(0, firstBlank) + "5" + EMPTY_GRID.slice(firstBlank + 1);

    await saveEntries(db, { userId, entries, clock });
    const reloaded = await getSudokuView(db, { userId, clock });
    expect(reloaded.grid[firstBlank]).toBe("5");
    expect(reloaded.solved).toBe(false);
  });

  /**
   * The one thing a client could try that would matter: overwriting a
   * given. It is discarded rather than rejected, at the one chokepoint
   * every path runs through.
   */
  it("ignores an entry forged over a given cell", async () => {
    const puzzle = await ensurePuzzle(db, gameDate);
    const givenIndex = [...puzzle.givens].findIndex((cell) => cell !== ".");
    const original = puzzle.givens[givenIndex];
    const forgedDigit = original === "9" ? "8" : "9";
    const forged =
      EMPTY_GRID.slice(0, givenIndex) +
      forgedDigit +
      EMPTY_GRID.slice(givenIndex + 1);

    const view = await saveEntries(db, { userId, entries: forged, clock });
    expect(view.grid[givenIndex]).toBe(original);
    const stored = await db.sudokuAttempt.findUniqueOrThrow({
      where: { userId_gameDate: { userId, gameDate } },
    });
    expect(stored.entries[givenIndex]).toBe(original);
  });

  it("will not judge a half-finished grid", async () => {
    await ensurePuzzle(db, gameDate);
    const result = await checkGrid(db, { userId, entries: EMPTY_GRID, clock });
    expect(result.wrong).toBe(false);
    expect(result.justSolved).toBe(false);
    expect(result.coinsAwarded).toBe("0");
  });

  it("says a full grid is wrong without saying which cell", async () => {
    const puzzle = await ensurePuzzle(db, gameDate);
    const solution = await solutionFor();
    // Swap two digits in cells the player actually owns. Swapping GIVENS
    // would not produce a wrong grid at all — `withGivens` puts them back,
    // which is the protection working rather than the check failing.
    const blanks = [...puzzle.givens]
      .map((cell, index) => (cell === "." ? index : -1))
      .filter((index) => index >= 0);
    const a = blanks[0] as number;
    const b = blanks.find(
      (index) => solution[index] !== solution[a],
    ) as number;
    const wrong = [...solution];
    wrong[a] = solution[b] as string;
    wrong[b] = solution[a] as string;

    const result = await checkGrid(db, {
      userId,
      entries: wrong.join(""),
      clock,
    });
    expect(result.wrong).toBe(true);
    expect(result.justSolved).toBe(false);
    expect(result.coinsAwarded).toBe("0");
    expect(result.view.wrongChecks).toBe(1);
    // The response carries no hint at all about where the mistake is.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(solution);
    expect(serialized).not.toContain("solution");
  });

  it("pays once for a solved grid, and never again", async () => {
    const solution = await solutionFor();
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const first = await checkGrid(db, { userId, entries: solution, clock });
    expect(first.justSolved).toBe(true);
    expect(BigInt(first.coinsAwarded)).toBe(SUDOKU_REWARD);
    expect(first.view.solved).toBe(true);
    // Solved in one call, having never saved: there is no elapsed time to
    // measure, and the row says "unknown" rather than claiming 0 seconds.
    expect(first.view.solveSeconds).toBeNull();

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + SUDOKU_REWARD);
    expect(
      await db.transaction.count({ where: { userId, type: "SUDOKU_REWARD" } }),
    ).toBe(1);

    const again = await checkGrid(db, { userId, entries: solution, clock });
    expect(again.justSolved).toBe(false);
    expect(again.coinsAwarded).toBe("0");
    const afterAgain = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterAgain.coins).toBe(after.coins);
    expect(
      await db.transaction.count({ where: { userId, type: "SUDOKU_REWARD" } }),
    ).toBe(1);
  });

  it("cannot be raced into paying twice", async () => {
    const solution = await solutionFor();
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const race = await runConcurrently([
      () => checkGrid(db, { userId, entries: solution, clock }),
      () => checkGrid(db, { userId, entries: solution, clock }),
      () => checkGrid(db, { userId, entries: solution, clock }),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(3);

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + SUDOKU_REWARD);
    expect(
      await db.transaction.count({ where: { userId, type: "SUDOKU_REWARD" } }),
    ).toBe(1);
  });

  it("refuses to overwrite a solved grid", async () => {
    const solution = await solutionFor();
    await checkGrid(db, { userId, entries: solution, clock });
    const view = await saveEntries(db, { userId, entries: EMPTY_GRID, clock });
    expect(view.solved).toBe(true);
    expect(view.grid).toBe(solution);
  });

  /**
   * A one-shot solve would otherwise post a permanent 0-second record that
   * nothing could ever beat. Time is only claimed when it was measured.
   */
  it("records no time for a grid solved without ever saving", async () => {
    const solution = await solutionFor();
    await checkGrid(db, { userId, entries: solution, clock });
    const view = await getSudokuView(db, { userId, clock });
    expect(view.solved).toBe(true);
    expect(view.solveSeconds).toBeNull();
    expect(view.personalBestSeconds).toBeNull();
  });

  it("records a time when the player actually worked at it", async () => {
    const solution = await solutionFor();
    const started = new Date("2099-05-05T09:00:00Z");
    // Opened, typed something, then solved ninety seconds later.
    await saveEntries(db, {
      userId,
      entries: EMPTY_GRID,
      clock: new FixedClock(started),
    });
    await checkGrid(db, {
      userId,
      entries: solution,
      clock: new FixedClock(new Date(started.getTime() + 90_000)),
    });

    const mine = await getSudokuView(db, { userId, clock });
    expect(mine.solveSeconds).toBe(90);
    expect(mine.personalBestSeconds).toBe(90);

    // The other player's own view knows nothing about the first one's time.
    const theirs = await getSudokuView(db, { userId: otherId, clock });
    expect(theirs.personalBestSeconds).toBeNull();
    expect(theirs.solved).toBe(false);
  });

  /** The directory must never chalk a grid just by being rendered. */
  it("reports 'not started' from the directory without generating anything", async () => {
    await db.sudokuAttempt.deleteMany({ where: { gameDate: "2098-01-01" } });
    await db.sudokuPuzzle.deleteMany({ where: { gameDate: "2098-01-01" } });
    const entry = await getSudokuDirectoryEntry(db, {
      userId,
      gameDate: "2098-01-01",
    });
    expect(entry).toEqual({ started: false, solved: false, filled: 0, blanks: 0 });
    expect(
      await db.sudokuPuzzle.count({ where: { gameDate: "2098-01-01" } }),
    ).toBe(0);
  });
});
