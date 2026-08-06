/**
 * Word challenge integration: frozen global puzzles, authoritative
 * submission, rewards, idempotency, concurrency, and answer secrecy.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient, WordDifficulty } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { getBoard, submitGuess, WordGameError } from "./game";
import {
  ensureDailyPuzzles,
  regenerateFuturePuzzle,
  previewPuzzles,
  setFuturePuzzleReward,
} from "./puzzles";
import { importAnswerWords } from "./words";
import { DIFFICULTY_CONFIG } from "./config";
import { addGameDays, startOfGameDate, type GameDate } from "../game-day";
import { getDailyStatus } from "../status";

const prefix = fixturePrefix("dword");

// A unique far-future base date per run keeps puzzle rows from colliding
// across repeated test runs (the (gameDate, difficulty) key is global).
const YEAR = 2100 + Math.floor(Math.random() * 800);
const MONTH = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const BASE_DATE: GameDate = `${YEAR}-${MONTH}-10`;

function clockAt(gameDate: GameDate): FixedClock {
  return new FixedClock(
    new Date(startOfGameDate(gameDate).getTime() + 12 * 3_600_000),
  );
}

const ANSWERS = [
  "MOSS", "FERN", "GLOW", "MIST", "WISP", "BARK",
  "BRIAR", "GLADE", "CHARM", "HONEY", "RIVER", "BLOOM",
  "FOREST", "MEADOW", "WILLOW", "GARDEN", "SPIRIT", "EMBERS",
];

async function expectWordError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(WordGameError);
  expect((error as WordGameError).code).toBe(code);
}

describe.skipIf(!testDb)("daily word challenge (integration)", () => {
  const db = testDb as PrismaClient;
  const userIds: string[] = [];

  async function freshUser(suffix: string): Promise<string> {
    const user = await createTestUser(db, {
      username: `${prefix}_${suffix}`,
    });
    userIds.push(user.id);
    return user.id;
  }

  /** The frozen answer for a slot — read from the database, never guessed. */
  async function answerFor(
    gameDate: GameDate,
    difficulty: WordDifficulty,
  ): Promise<string> {
    const puzzle = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate, difficulty } },
      include: { answerWord: { select: { word: true } } },
    });
    return puzzle.answerWord.word;
  }

  /** An accepted word of the right length that is NOT the answer. */
  async function wrongGuess(
    gameDate: GameDate,
    difficulty: WordDifficulty,
    exclude: string[] = [],
  ): Promise<string> {
    const answer = await answerFor(gameDate, difficulty);
    const candidate = ANSWERS.find(
      (word) =>
        word.length === DIFFICULTY_CONFIG[difficulty].length &&
        word !== answer &&
        !exclude.includes(word),
    );
    if (!candidate) {
      throw new Error("fixture word list exhausted");
    }
    return candidate;
  }

  beforeAll(async () => {
    await importAnswerWords(db, ANSWERS, "test fixture");
    await ensureDailyPuzzles(db, BASE_DATE);
  });

  beforeEach(async () => {
    for (const id of userIds) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
  });

  afterAll(async () => {
    // Puzzles for the run's random dates keep history harmless; results
    // and guesses cascade with the users.
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  it("creates one frozen global puzzle per date and difficulty, even under races", async () => {
    const race = await runConcurrently([
      () => ensureDailyPuzzles(db, BASE_DATE),
      () => ensureDailyPuzzles(db, BASE_DATE),
      () => ensureDailyPuzzles(db, BASE_DATE),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(3);
    const puzzles = await db.dailyWordPuzzle.findMany({
      where: { gameDate: BASE_DATE },
    });
    expect(puzzles).toHaveLength(3);
    expect(new Set(puzzles.map((p) => p.difficulty)).size).toBe(3);
    // Re-running returns the same frozen answers.
    const again = await ensureDailyPuzzles(db, BASE_DATE);
    for (const puzzle of again) {
      const original = puzzles.find((p) => p.id === puzzle.id);
      expect(puzzle.answerWordId).toBe(original?.answerWordId);
    }
    // Rewards snapshot the difficulty defaults.
    const easy = puzzles.find((p) => p.difficulty === "EASY");
    expect(easy?.rewardCoins).toBe(DIFFICULTY_CONFIG.EASY.rewardCoins);
  });

  it("solves award the configured coins exactly once, with replay-safe retries", async () => {
    const userId = await freshUser("solver");
    const clock = clockAt(BASE_DATE);
    const answer = await answerFor(BASE_DATE, "EASY");
    const wrong = await wrongGuess(BASE_DATE, "EASY");
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const first = await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: wrong.toLowerCase(),
      idempotencyKey: randomUUID(),
      clock,
    });
    expect(first.status).toBe("IN_PROGRESS");
    expect(first.attemptsRemaining).toBe(4);
    expect(first.answer).toBeNull();
    expect(first.rewardCoins).toBe("0");

    const solveKey = randomUUID();
    const solved = await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: answer,
      idempotencyKey: solveKey,
      clock,
    });
    expect(solved.status).toBe("SOLVED");
    expect(solved.answer).toBe(answer);
    expect(solved.rewardCoins).toBe(
      DIFFICULTY_CONFIG.EASY.rewardCoins.toString(),
    );
    expect(solved.rewardTransactionId).not.toBeNull();

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + DIFFICULTY_CONFIG.EASY.rewardCoins);
    const ledger = await db.transaction.findMany({
      where: { userId, type: "DAILY_WORD_REWARD" },
    });
    expect(ledger).toHaveLength(1);

    // Same key: replayed identical result, no second reward.
    const replay = await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: answer,
      idempotencyKey: solveKey,
      clock,
    });
    expect(replay).toEqual(solved);
    // Fresh key after completion: rejected, still no second reward.
    await expectWordError(
      submitGuess(db, {
        userId,
        difficulty: "EASY",
        guess: answer,
        idempotencyKey: randomUUID(),
        clock,
      }),
      "ALREADY_COMPLETED",
    );
    const finalUser = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(finalUser.coins).toBe(after.coins);
  });

  it("enforces five valid guesses; invalid words cost nothing; failure reveals the answer", async () => {
    const userId = await freshUser("failer");
    const clock = clockAt(BASE_DATE);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    // Not in the dictionary: rejected without consuming an attempt.
    await expectWordError(
      submitGuess(db, {
        userId,
        difficulty: "MEDIUM",
        guess: "ZZZZZ",
        idempotencyKey: randomUUID(),
        clock,
      }),
      "WORD_NOT_ACCEPTED",
    );
    // Wrong length: rejected before anything else.
    await expectWordError(
      submitGuess(db, {
        userId,
        difficulty: "MEDIUM",
        guess: "MOSS",
        idempotencyKey: randomUUID(),
        clock,
      }),
      "INVALID_WORD_LENGTH",
    );
    let board = await getBoard(db, {
      userId,
      gameDate: BASE_DATE,
      difficulty: "MEDIUM",
    });
    expect(board.attemptsUsed).toBe(0);

    const answer = await answerFor(BASE_DATE, "MEDIUM");
    const wrongWords = ANSWERS.filter(
      (word) => word.length === 5 && word !== answer,
    ).slice(0, 5);
    expect(wrongWords).toHaveLength(5);
    let last = null;
    for (const word of wrongWords) {
      last = await submitGuess(db, {
        userId,
        difficulty: "MEDIUM",
        guess: word,
        idempotencyKey: randomUUID(),
        clock,
      });
    }
    expect(last?.status).toBe("FAILED");
    expect(last?.attemptsRemaining).toBe(0);
    expect(last?.answer).toBe(answer);
    expect(last?.rewardCoins).toBe("0");

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    await expectWordError(
      submitGuess(db, {
        userId,
        difficulty: "MEDIUM",
        guess: answer,
        idempotencyKey: randomUUID(),
        clock,
      }),
      "ALREADY_COMPLETED",
    );
    // The failed board keeps its guesses and reveals the answer on read.
    board = await getBoard(db, {
      userId,
      gameDate: BASE_DATE,
      difficulty: "MEDIUM",
    });
    expect(board.status).toBe("FAILED");
    expect(board.guesses).toHaveLength(5);
    expect(board.answer).toBe(answer);
    // The invalid probe was audited.
    const probes = await db.securityEvent.count({
      where: { userId, type: "daily-word-invalid" },
    });
    expect(probes).toBe(1);
  });

  it("simultaneous solving guesses award exactly one reward", async () => {
    const userId = await freshUser("racer");
    const clock = clockAt(BASE_DATE);
    const answer = await answerFor(BASE_DATE, "HARD");
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const race = await runConcurrently([
      () =>
        submitGuess(db, {
          userId,
          difficulty: "HARD",
          guess: answer,
          idempotencyKey: randomUUID(),
          clock,
        }),
      () =>
        submitGuess(db, {
          userId,
          difficulty: "HARD",
          guess: answer,
          idempotencyKey: randomUUID(),
          clock,
        }),
    ]);
    // Exactly one submission wins the guarded attempt slot.
    expect(race.fulfilled).toHaveLength(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + DIFFICULTY_CONFIG.HARD.rewardCoins);
    const result = await db.dailyWordResult.findFirstOrThrow({
      where: { userId, puzzle: { gameDate: BASE_DATE, difficulty: "HARD" } },
      include: { guesses: true },
    });
    expect(result.attemptsUsed).toBe(1);
    expect(result.guesses).toHaveLength(1);
    expect(result.status).toBe("SOLVED");
  });

  it("boards and status summaries never leak the answer before completion", async () => {
    const userId = await freshUser("peeker");
    const clock = clockAt(BASE_DATE);
    const answer = await answerFor(BASE_DATE, "EASY");
    const wrong = await wrongGuess(BASE_DATE, "EASY");
    await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: wrong,
      idempotencyKey: randomUUID(),
      clock,
    });
    const board = await getBoard(db, {
      userId,
      gameDate: BASE_DATE,
      difficulty: "EASY",
    });
    expect(board.answer).toBeNull();
    expect(JSON.stringify(board)).not.toContain(answer);
    const status = await getDailyStatus(db, { userId, gameDate: BASE_DATE });
    expect(status.word.EASY).toBe("IN_PROGRESS");
    expect(JSON.stringify(status)).not.toContain(answer);
  });

  it("future puzzles can be previewed, re-rewarded, and regenerated — until played", async () => {
    const future = addGameDays(BASE_DATE, 3);
    await ensureDailyPuzzles(db, future);
    const preview = await previewPuzzles(db, future);
    expect(preview).toHaveLength(3);
    expect(preview.every((entry) => entry.existing)).toBe(true);

    await setFuturePuzzleReward(db, {
      gameDate: future,
      difficulty: "EASY",
      rewardCoins: 123n,
      today: BASE_DATE,
    });
    const rewarded = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate: future, difficulty: "EASY" } },
    });
    expect(rewarded.rewardCoins).toBe(123n);

    const regenerated = await regenerateFuturePuzzle(db, {
      gameDate: future,
      difficulty: "EASY",
      today: BASE_DATE,
    });
    expect(regenerated.generationVersion).toBe(2);

    // Playing the puzzle freezes it completely.
    const userId = await freshUser("future");
    await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: await wrongGuess(future, "EASY"),
      idempotencyKey: randomUUID(),
      clock: clockAt(future),
    });
    await expect(
      regenerateFuturePuzzle(db, {
        gameDate: future,
        difficulty: "EASY",
        today: BASE_DATE,
      }),
    ).rejects.toThrowError(/PUZZLE_ALREADY_PLAYED/);
    await expect(
      setFuturePuzzleReward(db, {
        gameDate: future,
        difficulty: "EASY",
        rewardCoins: 5n,
        today: BASE_DATE,
      }),
    ).rejects.toThrowError(/PUZZLE_ALREADY_PLAYED/);
    // Past/today dates are never touchable.
    await expect(
      regenerateFuturePuzzle(db, {
        gameDate: BASE_DATE,
        difficulty: "EASY",
        today: BASE_DATE,
      }),
    ).rejects.toThrowError(/PUZZLE_NOT_FUTURE/);
  });
});
