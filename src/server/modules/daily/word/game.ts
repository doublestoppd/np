import type { WordDifficulty } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { recordSecurityEvent, flagIfSuspicious } from "@/server/security/audit";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { coinsToJSON } from "@/lib/money";
import { currentGameDate, type GameDate } from "../game-day";
import { enforceDailyRateLimit } from "../config";
import { DIFFICULTY_CONFIG } from "./config";
import { evaluateGuess, isSolvedEvaluation, normalizeWord } from "./evaluate";
import { isAcceptedGuess } from "./words";
import { getOrCreatePuzzle } from "./puzzles";

export class WordGameError extends DomainError {}

const CONFLICT_MESSAGE =
  "That guess is still being recorded — nothing was lost. Give it a second and check the board.";

export type GuessView = {
  guess: string;
  evaluation: string;
};

/**
 * JSON-safe submission result (stored as the idempotency replay payload).
 * The answer appears ONLY when the result is terminal.
 */
export type GuessSubmissionResult = {
  gameDate: GameDate;
  difficulty: WordDifficulty;
  status: "IN_PROGRESS" | "SOLVED" | "FAILED";
  attemptsUsed: number;
  attemptsRemaining: number;
  guesses: GuessView[];
  /** Serialized coins; "0" unless this submission solved the puzzle. */
  rewardCoins: string;
  rewardTransactionId: string | null;
  answer: string | null;
};

/**
 * Authoritative guess submission. The client contributes only the raw
 * guess text, the difficulty, and an idempotency key — game date, attempt
 * numbers, evaluation, and rewards are derived server-side. Invalid
 * dictionary words are rejected BEFORE the idempotent transaction and do
 * not consume an attempt. Concurrency: the attempt counter is advanced
 * with an equality-guarded update, so simultaneous submissions cannot
 * share a guess number, exceed the limit, or double-award the solve.
 */
export async function submitGuess(
  db: DbClient,
  {
    userId,
    difficulty,
    guess,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    difficulty: WordDifficulty;
    guess: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<GuessSubmissionResult> {
  await enforceDailyRateLimit(db, "daily-word-guess", userId, clock.now());
  const gameDate = currentGameDate(clock);
  const config = DIFFICULTY_CONFIG[difficulty];

  const normalized = normalizeWord(guess);
  if (!/^[A-Z]+$/.test(normalized) || normalized.length !== config.length) {
    throw new WordGameError(
      "INVALID_WORD_LENGTH",
      `Guesses need exactly ${config.length} letters.`,
    );
  }
  if (!(await isAcceptedGuess(db, normalized))) {
    await recordSecurityEvent(db, {
      userId,
      type: "daily-word-invalid",
      severity: "info",
      message: "Rejected word guess (not in dictionary)",
      metadata: { gameDate, difficulty },
    });
    await flagIfSuspicious(db, {
      userId,
      type: "daily-word-invalid",
      threshold: 40,
      windowMinutes: 10,
    });
    throw new WordGameError(
      "WORD_NOT_ACCEPTED",
      "That word isn't in the puzzle dictionary. The attempt wasn't used.",
    );
  }

  const puzzle = await getOrCreatePuzzle(db, gameDate, difficulty);

  const { result, replayed } = await withIdempotency<GuessSubmissionResult>(
    db,
    {
      userId,
      operation: "daily-word-guess",
      key: idempotencyKey,
      requestHash: requestHash({ puzzleId: puzzle.id, guess: normalized }),
    },
    async (tx) => {
      const now = clock.now();
      const board = await tx.dailyWordResult.upsert({
        where: { userId_puzzleId: { userId, puzzleId: puzzle.id } },
        create: { userId, puzzleId: puzzle.id },
        update: {},
      });
      if (board.status !== "IN_PROGRESS") {
        throw new WordGameError(
          "ALREADY_COMPLETED",
          "You've already finished this puzzle today. A new one arrives tomorrow.",
        );
      }
      if (board.attemptsUsed >= config.maxGuesses) {
        throw new WordGameError(
          "NO_ATTEMPTS_LEFT",
          "No guesses left for this puzzle today.",
        );
      }

      // Equality-guarded advance: concurrent submissions cannot both win.
      const advanced = await tx.dailyWordResult.updateMany({
        where: {
          id: board.id,
          status: "IN_PROGRESS",
          attemptsUsed: board.attemptsUsed,
        },
        data: { attemptsUsed: { increment: 1 } },
      });
      if (advanced.count === 0) {
        throw new WordGameError("CONCURRENT_GUESS", CONFLICT_MESSAGE);
      }
      const guessNumber = board.attemptsUsed + 1;

      const answerWord = await tx.wordEntry.findUniqueOrThrow({
        where: { id: puzzle.answerWordId },
        select: { word: true },
      });
      const evaluation = evaluateGuess(answerWord.word, normalized);
      await tx.dailyWordGuess.create({
        data: {
          resultId: board.id,
          guessNumber,
          guess: normalized,
          evaluation,
        },
      });

      const solved = isSolvedEvaluation(evaluation);
      const failed = !solved && guessNumber >= config.maxGuesses;
      let rewardTransactionId: string | null = null;

      if (solved) {
        // A zero reward (operator-configured) still solves — no ledger row.
        if (puzzle.rewardCoins > 0n) {
          const ledger = await recordLedger(tx, {
            userId,
            type: "DAILY_WORD_REWARD",
            coinsDelta: puzzle.rewardCoins,
            note: `Daily word challenge solved (${difficulty.toLowerCase()})`,
            metadata: { gameDate, difficulty, puzzleId: puzzle.id },
          });
          await creditCoins(tx, { userId, amount: puzzle.rewardCoins });
          rewardTransactionId = ledger.id;
        }
        await tx.dailyWordResult.update({
          where: { id: board.id },
          data: {
            status: "SOLVED",
            solvedAt: now,
            rewardCoins: puzzle.rewardCoins,
            rewardTransactionId,
          },
        });
      } else if (failed) {
        await tx.dailyWordResult.update({
          where: { id: board.id },
          data: { status: "FAILED", failedAt: now },
        });
      }

      const guesses = await tx.dailyWordGuess.findMany({
        where: { resultId: board.id },
        orderBy: { guessNumber: "asc" },
        select: { guess: true, evaluation: true },
      });
      const status = solved ? "SOLVED" : failed ? "FAILED" : "IN_PROGRESS";
      return {
        gameDate,
        difficulty,
        status,
        attemptsUsed: guessNumber,
        attemptsRemaining: config.maxGuesses - guessNumber,
        guesses,
        rewardCoins: solved ? coinsToJSON(puzzle.rewardCoins) : "0",
        rewardTransactionId,
        // The answer leaves the server only after the result is terminal.
        answer: solved || failed ? answerWord.word : null,
      } satisfies GuessSubmissionResult;
    },
  );

  if (!replayed && result.status === "SOLVED") {
    await recordSecurityEvent(db, {
      userId,
      type: "daily-reward",
      severity: "info",
      message: `Daily word reward granted (${difficulty})`,
      metadata: {
        gameDate,
        difficulty,
        coins: result.rewardCoins,
        transactionId: result.rewardTransactionId,
      },
    });
  }
  log.info("daily-word.guess", {
    userId,
    gameDate,
    difficulty,
    status: result.status,
    attemptsUsed: result.attemptsUsed,
    replayed,
    rewardTransactionId: result.rewardTransactionId,
  });
  return result;
}

export type BoardStatus = "AVAILABLE" | "IN_PROGRESS" | "SOLVED" | "FAILED";

export interface BoardView {
  difficulty: WordDifficulty;
  length: number;
  maxGuesses: number;
  /** Serialized coins for the difficulty's configured reward. */
  rewardCoins: string;
  status: BoardStatus;
  attemptsUsed: number;
  attemptsRemaining: number;
  guesses: GuessView[];
  /** Present only after SOLVED or FAILED. */
  answer: string | null;
  /** Serialized coins actually awarded (SOLVED only). */
  rewardEarned: string;
}

/**
 * Read-only board state for one difficulty. Never mutates; never includes
 * the answer while the board is playable.
 */
export async function getBoard(
  db: DbClient,
  {
    userId,
    gameDate,
    difficulty,
  }: { userId: string; gameDate: GameDate; difficulty: WordDifficulty },
): Promise<BoardView> {
  const config = DIFFICULTY_CONFIG[difficulty];
  const puzzle = await db.dailyWordPuzzle.findUnique({
    where: { gameDate_difficulty: { gameDate, difficulty } },
    include: { answerWord: { select: { word: true } } },
  });
  const base: BoardView = {
    difficulty,
    length: config.length,
    maxGuesses: config.maxGuesses,
    rewardCoins: coinsToJSON(config.rewardCoins),
    status: "AVAILABLE",
    attemptsUsed: 0,
    attemptsRemaining: config.maxGuesses,
    guesses: [],
    answer: null,
    rewardEarned: "0",
  };
  if (!puzzle) {
    return base;
  }
  base.rewardCoins = coinsToJSON(puzzle.rewardCoins);

  const result = await db.dailyWordResult.findUnique({
    where: { userId_puzzleId: { userId, puzzleId: puzzle.id } },
    include: {
      guesses: {
        orderBy: { guessNumber: "asc" },
        select: { guess: true, evaluation: true },
      },
    },
  });
  if (!result) {
    return base;
  }
  const terminal = result.status === "SOLVED" || result.status === "FAILED";
  return {
    ...base,
    status: result.attemptsUsed === 0 && !terminal ? "AVAILABLE" : result.status,
    attemptsUsed: result.attemptsUsed,
    attemptsRemaining: Math.max(0, config.maxGuesses - result.attemptsUsed),
    guesses: result.guesses,
    answer: terminal ? puzzle.answerWord.word : null,
    rewardEarned: coinsToJSON(result.rewardCoins),
  };
}
