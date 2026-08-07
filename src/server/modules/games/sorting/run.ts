import type { DbClient, DbReader, DbTx } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { recordSecurityEvent } from "@/server/security/audit";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { coinsToJSON } from "@/lib/money";
import {
  MAX_BATCH,
  PREVIEW_DEPTH,
  replay,
  SHELF_CAPACITY,
  SHELF_COUNT,
  type SortBoard,
  type SortKind,
} from "@/lib/games/sorting-rules";
import { buildDeck, DECK_VERSION, newDeckSeed } from "./deck";
import {
  enforceSortingRateLimit,
  SORTING_RULES_VERSION,
  SORTING_TIERS,
  tierValue,
} from "./config";
import { SortingError } from "./errors";

/**
 * The Sorting Bench: run lifecycle and adjudication.
 *
 * The security model is not "validate the score" — it is that **the
 * client has nothing worth lying about**. It submits shelf indices. The
 * server holds the seed, replays the whole move log, and derives the
 * board and the score itself. The only number a client can influence is
 * which shelf it asked for.
 */

/** What a client is allowed to know at any moment. */
export interface SortingRunView {
  runId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "STUCK" | "ABANDONED" | "VOID";
  board: SortBoard;
  score: number;
  /** Finds consumed so far. */
  drawIndex: number;
  /** Finds still in the deck, including the one in hand. */
  remaining: number;
  /**
   * The find in hand plus the next few — and nothing else. This window is
   * the entire deck knowledge that ever reaches a browser.
   */
  window: SortKind[];
  /** Placements this submission may carry. */
  batchLimit: number;
  gameDate: GameDate;
}

export interface SortingDayView {
  bestScore: number;
  coinsPaidToday: string;
  /** Coins the next tier would add, or null at the top. */
  nextTierScore: number | null;
}

function windowFor(deck: readonly SortKind[], drawIndex: number): SortKind[] {
  return deck.slice(drawIndex, drawIndex + MAX_BATCH + PREVIEW_DEPTH) as SortKind[];
}

function viewOf(
  run: {
    id: string;
    status: SortingRunView["status"];
    drawIndex: number;
    moves: string;
    score: number;
    seed: string;
    gameDate: string;
  },
  deck: readonly SortKind[],
): SortingRunView {
  const outcome = replay(deck, parseMoves(run.moves));
  return {
    runId: run.id,
    status: run.status,
    board: outcome.board,
    score: run.score,
    drawIndex: run.drawIndex,
    remaining: deck.length - run.drawIndex,
    // A finished run reveals nothing further; there is nothing to plan.
    window: run.status === "IN_PROGRESS" ? windowFor(deck, run.drawIndex) : [],
    batchLimit: MAX_BATCH,
    gameDate: run.gameDate,
  };
}

function parseMoves(moves: string): number[] {
  return [...moves].map((character) => Number(character));
}

function serializeMoves(moves: readonly number[]): string {
  return moves.join("");
}

/**
 * Starts a run, abandoning any run still open. One live run per player is
 * the rule that stops a player holding several boards and submitting to
 * whichever turned out well.
 */
export async function startRun(
  db: DbClient,
  { userId, clock = systemClock }: { userId: string; clock?: Clock },
): Promise<SortingRunView> {
  await enforceSortingRateLimit(db, "sorting-start", userId, clock.now());
  const gameDate = currentGameDate(clock);
  const seed = newDeckSeed();

  const run = await db.$transaction(async (tx) => {
    await tx.sortingRun.updateMany({
      where: { userId, status: "IN_PROGRESS" },
      data: { status: "ABANDONED", endedAt: clock.now() },
    });
    return tx.sortingRun.create({
      data: {
        userId,
        gameDate,
        seed,
        deckVersion: DECK_VERSION,
        rulesVersion: SORTING_RULES_VERSION,
      },
    });
  });

  return viewOf({ ...run, status: "IN_PROGRESS" }, buildDeck(seed));
}

/** The run a player is in the middle of, if any. */
export async function currentRun(
  db: DbClient,
  { userId }: { userId: string },
): Promise<SortingRunView | null> {
  const run = await db.sortingRun.findFirst({
    where: { userId, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });
  if (!run) {
    return null;
  }
  return viewOf({ ...run, status: "IN_PROGRESS" }, buildDeck(run.seed));
}

export async function dayView(
  db: DbReader,
  { userId, clock = systemClock }: { userId: string; clock?: Clock },
): Promise<SortingDayView> {
  const gameDate = currentGameDate(clock);
  const best = await db.sortingDailyBest.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
  });
  const score = best?.bestScore ?? 0;
  const next = SORTING_TIERS.find((tier) => score < tier.score);
  return {
    bestScore: score,
    coinsPaidToday: coinsToJSON(best?.coinsPaid ?? 0n),
    nextTierScore: next?.score ?? null,
  };
}

export interface SubmitResult {
  run: SortingRunView;
  day: SortingDayView;
  /** Coins this submission actually paid, serialized. */
  coinsAwarded: string;
}

/**
 * Applies a batch of placements.
 *
 * The window is CLAIMED before anything is validated. That ordering is
 * the point of the whole design: a player who submits a batch, sees it go
 * badly, and submits a different one for the same finds must fail — and
 * they do, because the second batch carries a `fromDrawIndex` the row no
 * longer holds.
 *
 * An illegal move VOIDS the run and commits. Throwing would roll the
 * claim back and hand exactly that fork back to the caller, which is the
 * bug this shape exists to prevent. An honest client cannot produce an
 * illegal move: it runs the same rules locally.
 */
export async function submitBatch(
  db: DbClient,
  {
    userId,
    runId,
    fromDrawIndex,
    moves,
    clock = systemClock,
  }: {
    userId: string;
    runId: string;
    fromDrawIndex: number;
    moves: number[];
    clock?: Clock;
  },
): Promise<SubmitResult> {
  await enforceSortingRateLimit(db, "sorting-move", userId, clock.now());
  if (
    moves.length === 0 ||
    moves.length > MAX_BATCH ||
    moves.some(
      (shelf) => !Number.isInteger(shelf) || shelf < 0 || shelf >= SHELF_COUNT,
    )
  ) {
    throw new SortingError("INVALID_BATCH");
  }

  const now = clock.now();
  const gameDate = currentGameDate(clock);

  const result = await db.$transaction(async (tx) => {
    const run = await tx.sortingRun.findUnique({ where: { id: runId } });
    if (!run || run.userId !== userId) {
      throw new SortingError("RUN_NOT_FOUND");
    }
    if (run.status !== "IN_PROGRESS") {
      throw new SortingError("RUN_FINISHED");
    }

    // Claim the window FIRST. Everything after this is adjudication.
    const claimed = await tx.sortingRun.updateMany({
      where: { id: runId, status: "IN_PROGRESS", drawIndex: fromDrawIndex },
      data: { drawIndex: fromDrawIndex + moves.length },
    });
    if (claimed.count === 0) {
      throw new SortingError("STALE_BATCH");
    }

    const deck = buildDeck(run.seed);
    const previous = parseMoves(run.moves);
    const combined = [...previous, ...moves];

    let outcome;
    try {
      outcome = replay(deck, combined);
    } catch {
      return voidRun(tx, { run, userId, now, reason: "illegal-placement" });
    }
    // A batch longer than the deck or reaching past a bust is truncated
    // by `replay`; a batch that placed fewer than it claimed means the
    // client asked for moves that could not exist.
    if (outcome.placed < previous.length) {
      return voidRun(tx, { run, userId, now, reason: "impossible-batch" });
    }

    const accepted = combined.slice(0, outcome.placed);
    const status = outcome.cleared
      ? ("COMPLETED" as const)
      : outcome.stuck
        ? ("STUCK" as const)
        : ("IN_PROGRESS" as const);

    const updated = await tx.sortingRun.update({
      where: { id: runId },
      data: {
        moves: serializeMoves(accepted),
        score: outcome.score,
        drawIndex: outcome.placed,
        status,
        endedAt: status === "IN_PROGRESS" ? null : now,
      },
    });

    const coins =
      status === "IN_PROGRESS"
        ? 0n
        : await settleDay(tx, {
            userId,
            gameDate,
            runId,
            score: outcome.score,
          });

    return {
      view: viewOf({ ...updated, status }, deck),
      coins,
    };
  });

  return {
    run: result.view,
    day: await dayView(db, { userId, clock }),
    coinsAwarded: coinsToJSON(result.coins),
  };
}

/**
 * Pays the difference between what the day's best has already earned and
 * what it earns now. Guarded on the observed `coinsPaid`, so two runs
 * finishing at once cannot both claim a tier: the loser re-reads and pays
 * only what is still owed, which is often nothing.
 */
async function settleDay(
  tx: DbTx,
  {
    userId,
    gameDate,
    runId,
    score,
  }: { userId: string; gameDate: GameDate; runId: string; score: number },
): Promise<bigint> {
  const existing = await tx.sortingDailyBest.upsert({
    where: { userId_gameDate: { userId, gameDate } },
    create: { userId, gameDate, bestScore: 0, coinsPaid: 0n },
    update: {},
  });

  const bestScore = Math.max(existing.bestScore, score);
  const owed = tierValue(bestScore) - existing.coinsPaid;
  if (owed <= 0n) {
    if (bestScore > existing.bestScore) {
      await tx.sortingDailyBest.updateMany({
        where: { id: existing.id, coinsPaid: existing.coinsPaid },
        data: { bestScore, bestRunId: runId },
      });
    }
    return 0n;
  }

  const claimed = await tx.sortingDailyBest.updateMany({
    where: { id: existing.id, coinsPaid: existing.coinsPaid },
    data: { bestScore, bestRunId: runId, coinsPaid: tierValue(bestScore) },
  });
  if (claimed.count === 0) {
    // Another run settled first; it paid what was owed.
    return 0n;
  }

  const ledger = await recordLedger(tx, {
    userId,
    type: "SORTING_REWARD",
    coinsDelta: owed,
    quantity: 1,
    note: `Sorting Bench — best of the day: ${bestScore}`,
    metadata: { gameDate, bestScore },
  });
  await creditCoins(tx, { userId, amount: owed });
  await tx.sortingPayout.create({
    data: {
      dailyBestId: existing.id,
      runId,
      scoreAtPayout: bestScore,
      coins: owed,
      transactionId: ledger.id,
    },
  });
  return owed;
}

/**
 * Voids a run and COMMITS. The claim above stays spent, so the window
 * cannot be retried with different moves.
 */
async function voidRun(
  tx: DbTx,
  {
    run,
    userId,
    now,
    reason,
  }: {
    run: { id: string; seed: string; gameDate: string; moves: string; score: number };
    userId: string;
    now: Date;
    reason: string;
  },
): Promise<{ view: SortingRunView; coins: bigint }> {
  const updated = await tx.sortingRun.update({
    where: { id: run.id },
    data: { status: "VOID", endedAt: now },
  });
  await recordSecurityEvent(tx, {
    userId,
    type: "sorting-illegal-move",
    severity: "warning",
    message: "Sorting Bench run voided by an impossible submission",
    metadata: { runId: run.id, reason },
  });
  log.warn("sorting.voided", { userId, runId: run.id, reason });
  return {
    view: viewOf({ ...updated, status: "VOID" }, buildDeck(run.seed)),
    coins: 0n,
  };
}

export { SHELF_CAPACITY, SHELF_COUNT };
