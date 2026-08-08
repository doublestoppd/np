import { randomBytes } from "node:crypto";
import type { ArcadeGame } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { recordSecurityEvent } from "@/server/security/audit";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { coinsToJSON } from "@/lib/money";
import {
  ARCADE_CLAIMS_PER_DAY,
  decodeTrace,
  MAX_RUN_AGE_MS,
  replay,
  TICK_MS,
  WALL_CLOCK_TOLERANCE_PCT,
} from "@/lib/games/arcade/core";
import { coinsForScore } from "@/lib/games/arcade/rewards";
import {
  ARCADE_GAMES,
  enforceArcadeRateLimit,
} from "./config";
import { ArcadeError } from "./errors";

/**
 * Arcade run lifecycle and adjudication (ADR-62).
 *
 * **The client submits inputs, never a score.** It posts the tick numbers
 * it acted on; this module replays the same integer physics against the
 * run's own seed and derives the score itself. That is the Stonesetter's
 * Table's model (ADR-47) moved from turns to ticks — there is no number in
 * the request worth inflating, so there is nothing to validate a score
 * against and no "reasonable maximum" to guess at.
 *
 * Four things then stand between a forged trace and coins:
 *
 * 1. **The replay.** A trace that does not actually clear the walls scores
 *    what it actually achieved. Making up a big number is not an option
 *    that exists; you would have to make up a trace that really plays.
 * 2. **The wall clock.** A run that simulated ninety seconds must have
 *    taken at least seventy-two seconds of real time. A program that
 *    solves the course instantly and posts a perfect trace fails here. One
 *    that sleeps through the run to pass is spending the same minutes a
 *    person spends, for a capped reward — at which point it has stopped
 *    being an exploit and started being a very boring way to play.
 * 3. **The seed.** Issued per run, so last night's perfect trace describes
 *    a course that no longer exists.
 * 4. **The cap.** Three claims a day and a curve that flattens, so the
 *    difference between a good player and a perfect program is a few
 *    coins. This is the one that matters most, and it is a design choice
 *    rather than a security control: the reason not to cheat at this is
 *    that cheating at it is not worth the electricity.
 *
 * What none of that stops is a person writing a bot that genuinely plays
 * well and lets it run in real time. Nothing can, short of not having the
 * game — and the ceiling is low enough that it does not matter.
 */

/** A fresh course seed. Not a secret; see the schema comment on `seed`. */
function newCourseSeed(): string {
  return randomBytes(8).toString("hex");
}

export interface ArcadeRunView {
  runId: string;
  game: ArcadeGame;
  /** The client needs this to draw the course. */
  seed: string;
  gameDate: GameDate;
}

export interface ArcadeDayView {
  game: ArcadeGame;
  /** Claims already taken today, 0..ARCADE_CLAIMS_PER_DAY. */
  claimsUsed: number;
  claimsPerDay: number;
  /** Serialized coins collected at this game today. */
  coinsToday: string;
  /**
   * The player's own best today, and ever. Never anybody else's — the game
   * does not rank one player against another (CLAUDE.md), so there is no
   * query here that reads another account.
   */
  bestToday: number;
  bestEver: number;
}

export async function getArcadeDay(
  db: DbClient,
  {
    userId,
    game,
    clock = systemClock,
  }: { userId: string; game: ArcadeGame; clock?: Clock },
): Promise<ArcadeDayView> {
  const gameDate = currentGameDate(clock);
  const [payouts, todayBest, everBest] = await Promise.all([
    db.arcadePayout.findMany({
      where: { userId, game, gameDate },
      select: { coins: true },
    }),
    db.arcadeRun.aggregate({
      where: { userId, game, gameDate, status: "FINISHED" },
      _max: { score: true },
    }),
    db.arcadeRun.aggregate({
      where: { userId, game, status: "FINISHED" },
      _max: { score: true },
    }),
  ]);
  return {
    game,
    claimsUsed: payouts.length,
    claimsPerDay: ARCADE_CLAIMS_PER_DAY,
    coinsToday: coinsToJSON(payouts.reduce((sum, p) => sum + p.coins, 0n)),
    bestToday: todayBest._max.score ?? 0,
    bestEver: everBest._max.score ?? 0,
  };
}

/**
 * Opens a run.
 *
 * Any run still open at this game is abandoned rather than refused: a
 * player who navigated away mid-flight wants another go, not an error, and
 * an unsubmitted run has paid nothing, so there is nothing to farm by
 * restarting. `startedAt` is stamped here, which is what the wall-clock
 * check measures against — and stamping it early only ever makes the
 * elapsed time longer, so it can never falsely accuse anybody.
 */
export async function startRun(
  db: DbClient,
  {
    userId,
    game,
    clock = systemClock,
  }: { userId: string; game: ArcadeGame; clock?: Clock },
): Promise<ArcadeRunView> {
  const now = clock.now();
  await enforceArcadeRateLimit(db, "arcade-start", userId, now);
  const gameDate = currentGameDate(clock);

  const run = await db.$transaction(async (tx) => {
    await tx.arcadeRun.updateMany({
      where: { userId, game, status: "IN_PROGRESS" },
      data: { status: "VOID", endedAt: now },
    });
    return tx.arcadeRun.create({
      data: {
        userId,
        game,
        gameDate,
        seed: newCourseSeed(),
        startedAt: now,
      },
    });
  });

  return {
    runId: run.id,
    game,
    seed: run.seed,
    gameDate: gameDate,
  };
}

export type SubmitRunResult = {
  /** Derived by the replay. The client's opinion never appears here. */
  score: number;
  /** Serialized coins actually paid; "0" when the day's claims are spent. */
  coinsAwarded: string;
  /** True when the run was good but there was no claim left to spend. */
  unpaid: boolean;
  claimsUsed: number;
  claimsPerDay: number;
  bestEver: number;
  /** True when this run beat the player's own record. Never anyone else's. */
  personalBest: boolean;
};

/**
 * Scores a finished run and pays for it if a claim is left.
 *
 * Everything that depends on state lives inside the idempotent body, so a
 * double-tapped submission returns the stored result rather than being
 * told the run is finished — the ordering trap ADR-59 records.
 */
export async function submitRun(
  db: DbClient,
  {
    userId,
    runId,
    trace,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    runId: string;
    trace: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: SubmitRunResult; replayed: boolean }> {
  const now = clock.now();
  await enforceArcadeRateLimit(db, "arcade-submit", userId, now);

  try {
    return await scoreRun(db, { userId, runId, trace, idempotencyKey, clock, now });
  } catch (error) {
    // The refusal has to OUTLIVE the transaction it was raised in.
    //
    // These checks run inside the idempotent body, which is right — they
    // depend on the run's state. But throwing from inside a transaction
    // rolls it back, so the first draft's void and audit row were undone
    // by the very error that caused them, and every rejected submission
    // vanished without trace. The player got the right message and the
    // operator got nothing at all, which is the wrong half to keep.
    //
    // So the write happens here, on the root client, after the rollback.
    if (error instanceof ArcadeError && error.refusal) {
      await markRefused(db, {
        userId,
        runId,
        reason: error.refusal.reason,
        detail: error.refusal.detail,
        now,
      });
    }
    throw error;
  }
}

async function scoreRun(
  db: DbClient,
  {
    userId,
    runId,
    trace,
    idempotencyKey,
    clock,
    now,
  }: {
    userId: string;
    runId: string;
    trace: string;
    idempotencyKey: string;
    clock: Clock;
    now: Date;
  },
): Promise<{ result: SubmitRunResult; replayed: boolean }> {
  return withIdempotency<SubmitRunResult>(
    db,
    {
      userId,
      operation: "arcade-submit",
      key: idempotencyKey,
      requestHash: requestHash({ runId, trace }),
    },
    async (tx) => {
      const run = await tx.arcadeRun.findUnique({ where: { id: runId } });
      if (!run || run.userId !== userId) {
        throw new ArcadeError("RUN_NOT_FOUND");
      }
      if (run.status !== "IN_PROGRESS") {
        throw new ArcadeError("RUN_FINISHED");
      }
      if (now.getTime() - run.startedAt.getTime() > MAX_RUN_AGE_MS) {
        // Not an accusation — a tab left open overnight lands here — but
        // an unbounded window would let somebody bank a stock of open runs
        // and submit them all when a course they liked came up.
        throw new ArcadeError("RUN_STALE", { reason: "STALE" });
      }

      const decoded = decodeTrace(trace);
      if ("problem" in decoded) {
        throw new ArcadeError("IMPLAUSIBLE", { reason: decoded.problem });
      }

      const config = ARCADE_GAMES[run.game];
      const outcome = replay(config.sim, run.seed, decoded.events);

      // The wall-clock floor. Simulated time cannot exceed real time, give
      // or take the tolerance — see WALL_CLOCK_TOLERANCE_PCT for why the
      // slack only ever forgives honest players.
      const simulatedMs = outcome.ticks * TICK_MS;
      const elapsedMs = now.getTime() - run.startedAt.getTime();
      if (elapsedMs * 100 < simulatedMs * WALL_CLOCK_TOLERANCE_PCT) {
        throw new ArcadeError("IMPLAUSIBLE", {
          reason: "TOO_QUICK",
          detail: { simulatedMs, elapsedMs },
        });
      }

      // Guarded: the transition out of IN_PROGRESS is the claim on this
      // run. Two submissions racing cannot both score it.
      const claimed = await tx.arcadeRun.updateMany({
        where: { id: runId, status: "IN_PROGRESS" },
        data: {
          status: "FINISHED",
          trace,
          score: outcome.score,
          ticks: outcome.ticks,
          endedAt: now,
        },
      });
      if (claimed.count === 0) {
        throw new ArcadeError("CONCURRENT_SUBMIT");
      }

      const gameDate = currentGameDate(clock);
      const used = await tx.arcadePayout.count({
        where: { userId, game: run.game, gameDate },
      });
      const coins = coinsForScore(config.curve, outcome.score);

      let paid = 0n;
      if (used < ARCADE_CLAIMS_PER_DAY && coins > 0n) {
        // The unique constraint on (user, day, game, claimIndex) is the
        // limit; the count above only picks the next index. A race that
        // both read `used` as 2 has one of them lose the insert, and the
        // loser's run is still recorded — it simply goes unpaid, which is
        // exactly what a fourth run of the day does anyway.
        try {
          const ledger = await recordLedger(tx, {
            userId,
            type: "ARCADE_CLAIM",
            coinsDelta: coins,
            note: `${config.name}: ${outcome.score} ${
              outcome.score === 1 ? config.unit[0] : config.unit[1]
            }`,
          });
          await tx.arcadePayout.create({
            data: {
              userId,
              gameDate,
              game: run.game,
              claimIndex: used + 1,
              runId,
              score: outcome.score,
              coins,
              transactionId: ledger.id,
            },
          });
          await creditCoins(tx, { userId, amount: coins });
          paid = coins;
        } catch (error) {
          // A lost race on the claim index. The run stands, unpaid.
          if (!isUniqueViolation(error)) throw error;
        }
      }

      const best = await tx.arcadeRun.aggregate({
        where: { userId, game: run.game, status: "FINISHED" },
        _max: { score: true },
      });
      const bestEver = best._max.score ?? outcome.score;

      log.info("arcade.submitted", {
        userId,
        game: run.game,
        score: outcome.score,
        ticks: outcome.ticks,
        coins: coinsToJSON(paid),
      });

      return {
        score: outcome.score,
        coinsAwarded: coinsToJSON(paid),
        unpaid: paid === 0n,
        claimsUsed: paid > 0n ? used + 1 : used,
        claimsPerDay: ARCADE_CLAIMS_PER_DAY,
        bestEver,
        personalBest: outcome.score > 0 && outcome.score >= bestEver,
      };
    },
  );
}

/**
 * Voids a refused run and records why, after the scoring transaction has
 * rolled back.
 *
 * Kept rather than discarded: a void run and its audit row are the only
 * evidence an operator has that somebody is probing, and the security log
 * is where a pattern shows up across accounts. The player is told none of
 * it — see the IMPLAUSIBLE message.
 *
 * Best-effort by construction: this runs after the failure, so if it
 * fails too the player still gets the right refusal. Nothing downstream
 * depends on the row existing.
 */
async function markRefused(
  db: DbClient,
  {
    userId,
    runId,
    reason,
    detail,
    now,
  }: {
    userId: string;
    runId: string;
    reason: string;
    detail?: Record<string, number>;
    now: Date;
  },
): Promise<void> {
  const voided = await db.arcadeRun.updateMany({
    where: { id: runId, userId, status: "IN_PROGRESS" },
    data: { status: "VOID", endedAt: now },
  });
  // Nothing was voided means the run was not this player's, or was
  // already finished — neither is worth an audit row, and logging one
  // would let anybody fill the security log by posting run ids.
  if (voided.count === 0) return;

  await recordSecurityEvent(db, {
    userId,
    type: "arcade.implausible",
    severity: "warning",
    message: `arcade run refused: ${reason}`,
    metadata: { runId, reason, ...detail },
  });
  log.warn("arcade.implausible", { userId, runId, reason, ...detail });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}
