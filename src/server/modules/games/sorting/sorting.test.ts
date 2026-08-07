/**
 * The Sorting Bench: run lifecycle, the anti-fork claim, and best-of-day
 * payout. Runs against a real PostgreSQL database.
 *
 * The security model under test is "the client has nothing worth lying
 * about" — so the assertions are mostly about what a determined caller
 * CANNOT do: fork a run, replay a window, submit an impossible board, or
 * get paid twice for the same score.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { currentRun, dayView, startRun, submitBatch } from "./run";
import { SortingError } from "./errors";
import { tierValue, SORTING_TIERS } from "./config";
import { buildDeck } from "./deck";
import {
  applyPlacement,
  emptyBoard,
  isLegalPlacement,
  SHELF_CAPACITY,
  replay,
  SHELF_COUNT,
  type SortBoard,
  type SortKind,
} from "@/lib/games/sorting-rules";
import { FixedClock } from "@test/helpers/clock";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

const prefix = fixturePrefix("sorting");
const DAY = new Date("2026-05-04T10:00:00Z");

async function expectSortingError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(SortingError);
  expect((error as SortingError).sortingCode).toBe(code);
}

describe.skipIf(!testDb)("sorting bench (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  const clock = new FixedClock(DAY);

  beforeEach(async () => {
    userId = (
      await createTestUser(db, {
        username: `${prefix}_${randomUUID().slice(0, 8)}`,
        coins: 0n,
      })
    ).id;
  });

  afterAll(async () => {
    await db.sortingPayout.deleteMany({
      where: { run: { user: { username: { startsWith: prefix } } } },
    });
    await db.sortingRun.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.sortingDailyBest.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.transaction.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  /**
   * Plays a whole run through, batch by batch, using only what a real
   * client can see: the board it holds and the seven-find window. The
   * strategy is greedy — stack a find on a shelf already showing its kind,
   * otherwise the shortest shelf — which reliably makes runs, so the
   * payout assertions test the tier table rather than testing luck.
   */
  async function playOut(
    runId: string,
  ): Promise<{ score: number; status: string }> {
    let view = await currentRun(db, { userId });
    while (view && view.status === "IN_PROGRESS") {
      let board = view.board;
      const moves: number[] = [];
      for (let i = 0; i < Math.min(view.batchLimit, view.remaining); i++) {
        const kind = view.window[i];
        if (kind === undefined) break;
        const shelf = chooseShelf(board, kind);
        if (shelf === null) break;
        moves.push(shelf);
        board = applyPlacement(board, kind, shelf).board;
      }
      if (moves.length === 0) break;
      const result = await submitBatch(db, {
        userId,
        runId,
        fromDrawIndex: view.drawIndex,
        moves,
        clock,
      });
      view = result.run;
    }
    return { score: view?.score ?? 0, status: view?.status ?? "NONE" };
  }

  /** Matching top first, then the shortest shelf with room. */
  function chooseShelf(board: SortBoard, kind: SortKind): number | null {
    let best: number | null = null;
    for (let i = 0; i < SHELF_COUNT; i++) {
      const shelf = board[i] ?? [];
      if (!isLegalPlacement(board, i)) continue;
      if (shelf[shelf.length - 1] === kind) return i;
      if (best === null || shelf.length < (board[best] ?? []).length) best = i;
    }
    return best;
  }

  it("never sends the deck or the seed to a caller", async () => {
    const run = await startRun(db, { userId, clock });
    const stored = await db.sortingRun.findUniqueOrThrow({
      where: { id: run.runId },
    });

    // The window is the entire deck knowledge a client ever holds.
    expect(run.window.length).toBeLessThanOrEqual(7);
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain(stored.seed);
    expect(serialized).not.toContain("seed");
    // And it is genuinely a prefix of the real deck, not a decoy.
    expect(run.window).toEqual(buildDeck(stored.seed).slice(0, run.window.length));
  });

  it("derives the score from the moves; the client never sends one", async () => {
    const run = await startRun(db, { userId, clock });
    const stored = await db.sortingRun.findUniqueOrThrow({
      where: { id: run.runId },
    });
    const deck = buildDeck(stored.seed);

    const moves = [0, 1, 2, 0, 1];
    const result = await submitBatch(db, {
      userId,
      runId: run.runId,
      fromDrawIndex: 0,
      moves,
      clock,
    });
    expect(result.run.score).toBe(replay(deck, moves).score);
    expect(result.run.drawIndex).toBe(moves.length);
  });

  it("refuses a second batch for the same finds — a run cannot be forked", async () => {
    // The attack: submit a batch, dislike the result, submit different
    // moves for the same finds. The window is claimed before adjudication
    // precisely so the second attempt fails.
    const run = await startRun(db, { userId, clock });
    await submitBatch(db, {
      userId,
      runId: run.runId,
      fromDrawIndex: 0,
      moves: [0, 0, 0],
      clock,
    });
    await expectSortingError(
      submitBatch(db, {
        userId,
        runId: run.runId,
        fromDrawIndex: 0,
        moves: [1, 2, 3],
        clock,
      }),
      "STALE_BATCH",
    );
    const stored = await db.sortingRun.findUniqueOrThrow({
      where: { id: run.runId },
    });
    expect(stored.moves).toBe("000");
    expect(stored.drawIndex).toBe(3);
  });

  it("voids the run on an impossible move, and COMMITS the void", async () => {
    // Committing matters: throwing would roll the claim back and hand the
    // window straight back, which is the fork this whole design exists to
    // stop. So this constructs a genuinely illegal move and checks the
    // run is dead AND the window stayed spent.
    const run = await startRun(db, { userId, clock });
    const stored = await db.sortingRun.findUniqueOrThrow({
      where: { id: run.runId },
    });
    const deck = buildDeck(stored.seed);

    // Fill shelf 0 to capacity without ever completing a run there.
    const moves: number[] = [];
    let board = emptyBoard();
    let index = 0;
    while ((board[0] ?? []).length < SHELF_CAPACITY) {
      const kind = deck[index] as SortKind;
      const trial = applyPlacement(board, kind, 0);
      const shelf = trial.clears.length === 0 ? 0 : 1;
      moves.push(shelf);
      board = applyPlacement(board, kind, shelf).board;
      index += 1;
    }
    await db.sortingRun.update({
      where: { id: run.runId },
      data: { moves: moves.join(""), drawIndex: moves.length },
    });

    // Shelf 0 is full; asking for it again cannot have happened.
    const result = await submitBatch(db, {
      userId,
      runId: run.runId,
      fromDrawIndex: moves.length,
      moves: [0],
      clock,
    });
    expect(result.run.status).toBe("VOID");
    expect(result.coinsAwarded).toBe("0");

    const after = await db.sortingRun.findUniqueOrThrow({
      where: { id: run.runId },
    });
    expect(after.status).toBe("VOID");
    // The claim stayed spent: the window is gone, not handed back.
    expect(after.drawIndex).toBe(moves.length + 1);

    // And the run is finished — no further submission can revive it.
    await expectSortingError(
      submitBatch(db, {
        userId,
        runId: run.runId,
        fromDrawIndex: moves.length + 1,
        moves: [1],
        clock,
      }),
      "RUN_FINISHED",
    );

    // The operator can see it happened.
    const audited = await db.securityEvent.count({
      where: { userId, type: "sorting-illegal-move" },
    });
    expect(audited).toBe(1);
  });

  it("rejects a batch that is empty, too long, or off the board", async () => {
    const run = await startRun(db, { userId, clock });
    for (const moves of [[], [0, 0, 0, 0, 0, 0], [SHELF_COUNT], [-1]]) {
      await expectSortingError(
        submitBatch(db, {
          userId,
          runId: run.runId,
          fromDrawIndex: 0,
          moves,
          clock,
        }),
        "INVALID_BATCH",
      );
    }
    // Nothing was consumed by any of them.
    const stored = await db.sortingRun.findUniqueOrThrow({
      where: { id: run.runId },
    });
    expect(stored.drawIndex).toBe(0);
  });

  it("refuses another player's run without leaking that it exists", async () => {
    const run = await startRun(db, { userId, clock });
    const stranger = await createTestUser(db, {
      username: `${prefix}_x_${randomUUID().slice(0, 6)}`,
    });
    await expectSortingError(
      submitBatch(db, {
        userId: stranger.id,
        runId: run.runId,
        fromDrawIndex: 0,
        moves: [0],
        clock,
      }),
      "RUN_NOT_FOUND",
    );
  });

  it("keeps one live run: starting again abandons the last", async () => {
    const first = await startRun(db, { userId, clock });
    const second = await startRun(db, { userId, clock });
    expect(second.runId).not.toBe(first.runId);

    const live = await db.sortingRun.count({
      where: { userId, status: "IN_PROGRESS" },
    });
    expect(live).toBe(1);
    const abandoned = await db.sortingRun.findUniqueOrThrow({
      where: { id: first.runId },
    });
    expect(abandoned.status).toBe("ABANDONED");

    // And the abandoned run pays nothing, ever.
    await expectSortingError(
      submitBatch(db, {
        userId,
        runId: first.runId,
        fromDrawIndex: 0,
        moves: [0],
        clock,
      }),
      "RUN_FINISHED",
    );
  });

  it("pays a tier once: repetition earns nothing, improvement earns the difference", async () => {
    // Play a whole run badly enough to finish, then check the ledger says
    // exactly what the tier table says and no more.
    const run = await startRun(db, { userId, clock });
    const outcome = await playOut(run.runId);
    expect(["COMPLETED", "STUCK"]).toContain(outcome.status);
    // A greedy player scores; the tier table is what is under test here.
    expect(outcome.score).toBeGreaterThan(0);

    const day = await dayView(db, { userId, clock });
    expect(day.bestScore).toBe(outcome.score);
    expect(BigInt(day.coinsPaidToday)).toBe(tierValue(outcome.score));

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(tierValue(outcome.score));

    // Every coin has a ledger row and a payout row that agree.
    const ledger = await db.transaction.aggregate({
      where: { userId, type: "SORTING_REWARD" },
      _sum: { coinsDelta: true },
    });
    const payouts = await db.sortingPayout.aggregate({
      where: { run: { userId } },
      _sum: { coins: true },
    });
    expect(ledger._sum.coinsDelta ?? 0n).toBe(tierValue(outcome.score));
    expect(payouts._sum.coins ?? 0n).toBe(tierValue(outcome.score));

    // A second run at the SAME strategy scores the same and pays nothing:
    // this is what makes the game unlimited without being a grind.
    const again = await startRun(db, { userId, clock });
    const second = await playOut(again.runId);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(tierValue(Math.max(outcome.score, second.score)));
  });

  it("never pays beyond the day's ceiling", async () => {
    const ceiling = SORTING_TIERS[SORTING_TIERS.length - 1]!.coins;
    for (let i = 0; i < 3; i++) {
      const run = await startRun(db, { userId, clock });
      await playOut(run.runId);
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBeLessThanOrEqual(ceiling);
  });

  it("resumes a run from its seed and moves, so a closed tab loses nothing", async () => {
    const run = await startRun(db, { userId, clock });
    const submitted = await submitBatch(db, {
      userId,
      runId: run.runId,
      fromDrawIndex: 0,
      moves: [0, 1, 2],
      clock,
    });

    // Nothing about the board is stored; this is a fresh derivation.
    const resumed = await currentRun(db, { userId });
    expect(resumed?.runId).toBe(run.runId);
    expect(resumed?.board).toEqual(submitted.run.board);
    expect(resumed?.score).toBe(submitted.run.score);
    expect(resumed?.drawIndex).toBe(3);
  });

  it("builds the same deck from the same seed, every time", async () => {
    // A run in progress must not change under its player when anything
    // else in the system does.
    const seed = "0123456789abcdef0123456789abcdef";
    const a = buildDeck(seed);
    const b = buildDeck(seed);
    expect(a).toEqual(b);
    expect(a).toHaveLength(60);
    const counts = new Map<SortKind, number>();
    for (const kind of a) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    expect([...counts.values()]).toEqual([12, 12, 12, 12, 12]);
    // A different seed is a different deck.
    expect(buildDeck("f".repeat(32))).not.toEqual(a);
  });
});
