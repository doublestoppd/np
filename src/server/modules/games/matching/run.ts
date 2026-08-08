import type { DbClient, DbReader } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { recordSecurityEvent } from "@/server/security/audit";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { coinsToJSON } from "@/lib/money";
import {
  MATCHING_CONFIG,
  replayFlips,
  rewardFor,
  type MatchingDifficulty,
} from "@/lib/games/matching-rules";
import { buildLayout, LAYOUT_VERSION, newLayoutSeed } from "./layout";
import { enforceMatchingRateLimit, MATCHING_RULES_VERSION } from "./config";
import { MatchingError } from "./errors";

/**
 * The Stonesetter's Table: run lifecycle and adjudication (ADR-47).
 *
 * The security model is the Sorting Bench's, and for the same reason:
 * **the client has nothing worth lying about.** It submits card indices.
 * The server holds the seed, replays the whole flip log, and derives the
 * board, the matches and the payout itself. There is no "I found a pair"
 * message a browser can send.
 *
 * What the client is told is exactly what a person sitting at the table
 * can see: which stones are face up right now, and which have been turned
 * over for good. The faces of everything else never leave the server.
 */

/** Two hex characters per card index, so a log is fixed-width and cheap. */
function encodeFlips(flips: readonly number[]): string {
  return flips.map((card) => card.toString(16).padStart(2, "0")).join("");
}

function decodeFlips(encoded: string): number[] {
  const flips: number[] = [];
  for (let i = 0; i + 2 <= encoded.length; i += 2) {
    flips.push(Number.parseInt(encoded.slice(i, i + 2), 16));
  }
  return flips;
}

export interface MatchingRunView {
  runId: string;
  difficulty: MatchingDifficulty;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED" | "VOID";
  /** Total cards on the table. */
  cards: number;
  columns: number;
  /** Indices turned over for good, with the pair id now visible. */
  matched: Array<{ card: number; pair: number }>;
  /** The single stone currently face up, if any, and what is under it. */
  faceUp: Array<{ card: number; pair: number }>;
  /**
   * The turn that just resolved: both stones and what was under them.
   *
   * The replay resolves a turn on the second flip — two stones never
   * persist face up — so without this the client is never told what the
   * second stone was. Turning one and being shown nothing at all is what
   * the table actually did: you tapped, and the board looked unchanged.
   *
   * This reveals nothing the player has not earned. They turned both
   * stones; being shown what they turned is the entire game.
   */
  lastTurn: {
    cards: [number, number];
    pairs: [number, number];
    matched: boolean;
  } | null;
  flipsUsed: number;
  flipsRemaining: number;
  pairsFound: number;
  pairsTotal: number;
  /** Serialized coins this run would pay if finished from here. */
  potentialReward: string;
  /** Flips at or under which the bonus is paid. */
  par: number;
  gameDate: GameDate;
}

export interface MatchingDayView {
  /** Difficulties already paid today. */
  paidToday: MatchingDifficulty[];
  /** Serialized coins earned at this table today. */
  coinsToday: string;
}

function viewOf(
  run: {
    id: string;
    difficulty: MatchingDifficulty;
    status: MatchingRunView["status"];
    flips: string;
    seed: string;
    gameDate: string;
  },
): MatchingRunView {
  const config = MATCHING_CONFIG[run.difficulty];
  const layout = buildLayout(run.seed, run.difficulty);
  const flips = decodeFlips(run.flips);
  const outcome = replayFlips(layout, flips);
  const finished = run.status !== "IN_PROGRESS";
  // A turn is two flips. An even, non-empty, legal log therefore ends on
  // a resolved one; an odd log ends mid-turn, which `faceUp` already
  // describes.
  const resolved =
    !outcome.illegal && flips.length >= 2 && flips.length % 2 === 0
      ? (flips.slice(-2) as [number, number])
      : null;
  return {
    runId: run.id,
    difficulty: run.difficulty,
    status: run.status,
    cards: layout.length,
    columns: config.columns,
    // Only the faces of stones the player has legitimately turned. This is
    // the one place the layout is read into a response, and it is filtered
    // by what the replay says is visible.
    matched: outcome.matched.map((card) => ({
      card,
      pair: layout[card] as number,
    })),
    faceUp: finished
      ? []
      : outcome.faceUp.map((card) => ({ card, pair: layout[card] as number })),
    lastTurn:
      resolved && !finished
        ? {
            cards: resolved,
            pairs: [
              layout[resolved[0]] as number,
              layout[resolved[1]] as number,
            ],
            matched: layout[resolved[0]] === layout[resolved[1]],
          }
        : null,
    flipsUsed: outcome.flipsUsed,
    flipsRemaining: Math.max(0, config.flipBudget - outcome.flipsUsed),
    pairsFound: outcome.pairsFound,
    pairsTotal: config.pairs,
    potentialReward: coinsToJSON(rewardFor(run.difficulty, outcome.flipsUsed)),
    par: config.par,
    gameDate: run.gameDate as GameDate,
  };
}

/**
 * Starts a fresh table, abandoning any run in progress at this
 * difficulty. Abandoning rather than refusing: a player who navigated
 * away and came back wants a new board, not an error, and an abandoned
 * run pays nothing so there is nothing to farm by restarting.
 */
export async function startRun(
  db: DbClient,
  {
    userId,
    difficulty,
    clock = systemClock,
  }: { userId: string; difficulty: MatchingDifficulty; clock?: Clock },
): Promise<MatchingRunView> {
  await enforceMatchingRateLimit(db, "matching-start", userId, clock.now());
  const gameDate = currentGameDate(clock);

  const run = await db.$transaction(async (tx) => {
    await tx.matchingRun.updateMany({
      where: { userId, difficulty, status: "IN_PROGRESS" },
      data: { status: "ABANDONED", endedAt: clock.now() },
    });
    return tx.matchingRun.create({
      data: {
        userId,
        gameDate,
        difficulty,
        seed: newLayoutSeed(),
        rulesVersion: MATCHING_RULES_VERSION,
      },
    });
  });
  log.info("matching.started", { userId, difficulty, gameDate });
  return viewOf({ ...run, difficulty: run.difficulty as MatchingDifficulty });
}

export interface FlipResult {
  view: MatchingRunView;
  /** Serialized coins paid by this flip; "0" unless it completed a run. */
  coinsAwarded: string;
  /** True when the run finished but the day's payout was already taken. */
  alreadyPaidToday: boolean;
}

/**
 * Turns one stone.
 *
 * The counter advances under an equality guard on the stored flip log, so
 * two submissions racing cannot both append — the loser is told to try
 * again rather than silently forking the board.
 */
export async function flipCard(
  db: DbClient,
  {
    userId,
    runId,
    card,
    clock = systemClock,
  }: { userId: string; runId: string; card: number; clock?: Clock },
): Promise<FlipResult> {
  await enforceMatchingRateLimit(db, "matching-flip", userId, clock.now());

  const existing = await db.matchingRun.findFirst({
    // Scoped to the owner: another player's runId must be indistinguishable
    // from one that does not exist.
    where: { id: runId, userId },
  });
  if (!existing) {
    throw new MatchingError("RUN_NOT_FOUND");
  }
  if (existing.status !== "IN_PROGRESS") {
    throw new MatchingError("RUN_FINISHED");
  }

  const difficulty = existing.difficulty as MatchingDifficulty;
  const config = MATCHING_CONFIG[difficulty];
  const layout = buildLayout(existing.seed, difficulty);
  const flips = [...decodeFlips(existing.flips), card];
  const outcome = replayFlips(layout, flips);

  if (outcome.illegal) {
    // Void rather than repair. A legitimate client cannot produce this,
    // so the run is ended and audited; it pays nothing either way.
    await db.matchingRun.updateMany({
      where: { id: existing.id, status: "IN_PROGRESS" },
      data: { status: "VOID", endedAt: clock.now() },
    });
    await recordSecurityEvent(db, {
      userId,
      type: "suspicious-activity",
      severity: "warning",
      message: "Illegal matching-game flip; run voided",
      metadata: { runId, card, difficulty },
    });
    throw new MatchingError("ILLEGAL_FLIP");
  }
  if (outcome.flipsUsed > config.flipBudget) {
    await db.matchingRun.updateMany({
      where: { id: existing.id, status: "IN_PROGRESS" },
      data: { status: "ABANDONED", endedAt: clock.now() },
    });
    throw new MatchingError("OUT_OF_FLIPS");
  }

  const encoded = encodeFlips(flips);
  const complete = outcome.complete;

  const result = await db.$transaction(async (tx) => {
    // Equality-guarded append: concurrent flips cannot both land.
    const advanced = await tx.matchingRun.updateMany({
      where: { id: existing.id, status: "IN_PROGRESS", flips: existing.flips },
      data: {
        flips: encoded,
        pairsFound: outcome.pairsFound,
        ...(complete ? { status: "COMPLETED", endedAt: clock.now() } : {}),
      },
    });
    if (advanced.count === 0) {
      throw new MatchingError("CONCURRENT_FLIP");
    }
    if (!complete) {
      return { coins: 0n, alreadyPaid: false };
    }

    // Finished. The payout is once per difficulty per game day, enforced
    // by the unique constraint rather than counted: playing all evening
    // is free to the economy, and a bot earns what a person earns.
    const coins = rewardFor(difficulty, outcome.flipsUsed);
    const alreadyPaid = await tx.matchingPayout.findUnique({
      where: {
        userId_gameDate_difficulty: {
          userId,
          gameDate: existing.gameDate,
          difficulty,
        },
      },
    });
    if (alreadyPaid) {
      return { coins: 0n, alreadyPaid: true };
    }
    const ledger = await recordLedger(tx, {
      userId,
      type: "MATCHING_REWARD",
      coinsDelta: coins,
      note: `Cleared the ${difficulty.toLowerCase()} table in ${outcome.flipsUsed} turns`,
      metadata: {
        gameDate: existing.gameDate,
        difficulty,
        flips: outcome.flipsUsed,
      },
    });
    await creditCoins(tx, { userId, amount: coins });
    await tx.matchingPayout.create({
      data: {
        userId,
        gameDate: existing.gameDate,
        difficulty,
        runId: existing.id,
        coins,
        transactionId: ledger.id,
      },
    });
    return { coins, alreadyPaid: false };
  });

  const view = viewOf({
    ...existing,
    difficulty,
    flips: encoded,
    status: complete ? "COMPLETED" : "IN_PROGRESS",
  });
  log.info("matching.flip", {
    userId,
    runId,
    difficulty,
    flipsUsed: view.flipsUsed,
    pairsFound: view.pairsFound,
    complete,
    coins: coinsToJSON(result.coins),
  });
  return {
    view,
    coinsAwarded: coinsToJSON(result.coins),
    alreadyPaidToday: result.alreadyPaid,
  };
}

/** The player's current run at a difficulty, if any. */
export async function currentRun(
  db: DbReader,
  {
    userId,
    difficulty,
  }: { userId: string; difficulty: MatchingDifficulty },
): Promise<MatchingRunView | null> {
  const run = await db.matchingRun.findFirst({
    where: { userId, difficulty, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
  });
  return run ? viewOf({ ...run, difficulty }) : null;
}

/** What the player has already earned at this table today. */
export async function dayView(
  db: DbReader,
  { userId, gameDate = currentGameDate() }: { userId: string; gameDate?: GameDate },
): Promise<MatchingDayView> {
  const payouts = await db.matchingPayout.findMany({
    where: { userId, gameDate },
  });
  return {
    paidToday: payouts.map((row) => row.difficulty as MatchingDifficulty),
    coinsToday: coinsToJSON(
      payouts.reduce((total, row) => total + row.coins, 0n),
    ),
  };
}

export { LAYOUT_VERSION };
