/**
 * Word challenge integration: ordered rotation over the authored answer
 * lists, frozen puzzles, shape-only guess validation, rewards,
 * idempotency, and concurrency.
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
  PuzzlePoolEmptyError,
} from "./puzzles";
import { rotationIndex } from "./rotation";
import { DIFFICULTY_CONFIG, WORD_ROTATION_EPOCH } from "./config";
import { addGameDays, startOfGameDate, type GameDate } from "../game-day";
import { getDailyStatus } from "../status";
import { wordAnswers } from "../../../../../prisma/content/daily/word-answers";
import { seedWordAnswers } from "../../../../../prisma/seed/seed-daily";
import { SeedReport } from "../../../../../prisma/seed/report";

const prefix = fixturePrefix("dword");

// A far-future anchor unique-ish per run: rotation math is deterministic
// for ANY date, and pre-test cleanup removes unplayed puzzles at the
// chosen dates so reruns and content changes cannot leave stale answers.
const RUN_OFFSET = 10_000 + Math.floor(Math.random() * 50_000);
const BASE_DATE: GameDate = addGameDays(WORD_ROTATION_EPOCH, RUN_OFFSET);

function clockAt(gameDate: GameDate): FixedClock {
  return new FixedClock(
    new Date(startOfGameDate(gameDate).getTime() + 12 * 3_600_000),
  );
}

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
    const user = await createTestUser(db, { username: `${prefix}_${suffix}` });
    userIds.push(user.id);
    return user.id;
  }

  /** Active ordered answers for a difficulty, straight from the DB. */
  async function activeList(difficulty: WordDifficulty) {
    return db.dailyWordAnswer.findMany({
      where: { difficulty, active: true },
      orderBy: { sequencePosition: "asc" },
    });
  }

  /** Remove unplayed puzzles at dates this run is about to create. */
  async function clearUnplayedPuzzles(dates: GameDate[]): Promise<void> {
    await db.dailyWordPuzzle.deleteMany({
      where: { gameDate: { in: dates }, results: { none: {} } },
    });
  }

  beforeAll(async () => {
    // Converge the test database on the authored canonical rotation.
    await seedWordAnswers(db, wordAnswers, new SeedReport());
  });

  beforeEach(async () => {
    for (const id of userIds) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  it("selects answers sequentially with wraparound; difficulties rotate independently", async () => {
    const dayZero = WORD_ROTATION_EPOCH;
    const dayOne = addGameDays(WORD_ROTATION_EPOCH, 1);
    const wrapDate = addGameDays(BASE_DATE, 100);
    await clearUnplayedPuzzles([dayZero, dayOne, BASE_DATE, wrapDate]);

    // Day zero → position 0; day one → position 1 (100 active answers).
    await ensureDailyPuzzles(db, dayZero);
    await ensureDailyPuzzles(db, dayOne);
    for (const difficulty of ["EASY", "MEDIUM", "HARD"] as const) {
      const list = await activeList(difficulty);
      expect(list).toHaveLength(100);
      const zero = await db.dailyWordPuzzle.findUniqueOrThrow({
        where: { gameDate_difficulty: { gameDate: dayZero, difficulty } },
      });
      expect(zero.answerId).toBe(list[0]?.id);
      const one = await db.dailyWordPuzzle.findUniqueOrThrow({
        where: { gameDate_difficulty: { gameDate: dayOne, difficulty } },
      });
      expect(one.answerId).toBe(list[1]?.id);
    }

    // An arbitrary far date matches the pure rotation math, and +100 days
    // wraps to the same position.
    await ensureDailyPuzzles(db, BASE_DATE);
    await ensureDailyPuzzles(db, wrapDate);
    const words = new Set<string>();
    for (const difficulty of ["EASY", "MEDIUM", "HARD"] as const) {
      const list = await activeList(difficulty);
      const expected = list[rotationIndex(BASE_DATE, list.length)];
      const base = await db.dailyWordPuzzle.findUniqueOrThrow({
        where: { gameDate_difficulty: { gameDate: BASE_DATE, difficulty } },
        include: { answer: true },
      });
      expect(base.answerId).toBe(expected?.id);
      const wrapped = await db.dailyWordPuzzle.findUniqueOrThrow({
        where: { gameDate_difficulty: { gameDate: wrapDate, difficulty } },
      });
      expect(wrapped.answerId).toBe(base.answerId);
      expect(base.answer.word).toHaveLength(DIFFICULTY_CONFIG[difficulty].length);
      words.add(base.answer.word);
    }
    // Independent lists: three different words on the same game date.
    expect(words.size).toBe(3);
  });

  it("creates one frozen puzzle per date and difficulty, even under races", async () => {
    const raceDate = addGameDays(BASE_DATE, 1);
    await clearUnplayedPuzzles([raceDate]);
    const race = await runConcurrently([
      () => ensureDailyPuzzles(db, raceDate),
      () => ensureDailyPuzzles(db, raceDate),
      () => ensureDailyPuzzles(db, raceDate),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(3);
    const puzzles = await db.dailyWordPuzzle.findMany({
      where: { gameDate: raceDate },
    });
    expect(puzzles).toHaveLength(3);
    const again = await ensureDailyPuzzles(db, raceDate);
    for (const puzzle of again) {
      expect(puzzles.find((p) => p.id === puzzle.id)?.answerId).toBe(
        puzzle.answerId,
      );
    }
    const easy = puzzles.find((p) => p.difficulty === "EASY");
    expect(easy?.rewardCoins).toBe(DIFFICULTY_CONFIG.EASY.rewardCoins);
  });

  it("accepts any exact-length alphabetic guess and it consumes an attempt", async () => {
    const userId = await freshUser("shape");
    const gameDate = addGameDays(BASE_DATE, 2);
    await clearUnplayedPuzzles([gameDate]);
    const clock = clockAt(gameDate);

    // Arbitrary non-word sequences are valid guesses.
    const first = await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: "zzzz",
      idempotencyKey: randomUUID(),
      clock,
    });
    expect(first.attemptsUsed).toBe(1);
    expect(first.guesses[0]?.guess).toBe("ZZZZ");
    expect(first.status).toBe("IN_PROGRESS");

    // Malformed input is rejected BEFORE consuming anything.
    for (const bad of ["ABC", "ABCDE", "AB1D", "A BC", "IT'S", "CAFÉ", "ZZ-Z"]) {
      await expectWordError(
        submitGuess(db, {
          userId,
          difficulty: "EASY",
          guess: bad,
          idempotencyKey: randomUUID(),
          clock,
        }),
        "INVALID_GUESS",
      );
    }
    const board = await getBoard(db, { userId, gameDate, difficulty: "EASY" });
    expect(board.attemptsUsed).toBe(1);

    // QWERTY-style sequences count for the matching difficulty too.
    const qwerty = await submitGuess(db, {
      userId,
      difficulty: "MEDIUM",
      guess: "ABCDE",
      idempotencyKey: randomUUID(),
      clock,
    });
    expect(qwerty.attemptsUsed).toBe(1);
  });

  it("solves award the configured coins exactly once, with replay-safe retries", async () => {
    const userId = await freshUser("solver");
    const gameDate = addGameDays(BASE_DATE, 3);
    await clearUnplayedPuzzles([gameDate]);
    const clock = clockAt(gameDate);
    await ensureDailyPuzzles(db, gameDate);
    const puzzle = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate, difficulty: "EASY" } },
      include: { answer: true },
    });
    const answer = puzzle.answer.word;
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const first = await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: "QQQQ",
      idempotencyKey: randomUUID(),
      clock,
    });
    expect(first.status).toBe("IN_PROGRESS");
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
    expect(
      await db.transaction.count({ where: { userId, type: "DAILY_WORD_REWARD" } }),
    ).toBe(1);

    const replay = await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: answer,
      idempotencyKey: solveKey,
      clock,
    });
    expect(replay).toEqual(solved);
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

  it("enforces five guesses; failure reveals the answer and awards nothing", async () => {
    const userId = await freshUser("failer");
    const gameDate = addGameDays(BASE_DATE, 4);
    await clearUnplayedPuzzles([gameDate]);
    const clock = clockAt(gameDate);
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    // Five arbitrary valid guesses; none of these repeated-letter
    // sequences appear in the curated answer lists.
    const wrongWords = ["QQQQQ", "WWWWW", "XXXXX", "ZZZZZ", "VVVVV"];
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
    expect(last?.answer).toMatch(/^[A-Z]{5}$/);
    expect(last?.rewardCoins).toBe("0");

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    await expectWordError(
      submitGuess(db, {
        userId,
        difficulty: "MEDIUM",
        guess: "AAAAA",
        idempotencyKey: randomUUID(),
        clock,
      }),
      "ALREADY_COMPLETED",
    );
    const board = await getBoard(db, { userId, gameDate, difficulty: "MEDIUM" });
    expect(board.status).toBe("FAILED");
    expect(board.guesses).toHaveLength(5);
    expect(board.answer).toBe(last?.answer);
  });

  it("simultaneous solving guesses award exactly one reward", async () => {
    const userId = await freshUser("racer");
    const gameDate = addGameDays(BASE_DATE, 5);
    await clearUnplayedPuzzles([gameDate]);
    const clock = clockAt(gameDate);
    await ensureDailyPuzzles(db, gameDate);
    const puzzle = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate, difficulty: "HARD" } },
      include: { answer: true },
    });
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const race = await runConcurrently([
      () =>
        submitGuess(db, {
          userId,
          difficulty: "HARD",
          guess: puzzle.answer.word,
          idempotencyKey: randomUUID(),
          clock,
        }),
      () =>
        submitGuess(db, {
          userId,
          difficulty: "HARD",
          guess: puzzle.answer.word,
          idempotencyKey: randomUUID(),
          clock,
        }),
    ]);
    expect(race.fulfilled).toHaveLength(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + DIFFICULTY_CONFIG.HARD.rewardCoins);
    const result = await db.dailyWordResult.findFirstOrThrow({
      where: { userId, puzzleId: puzzle.id },
      include: { guesses: true },
    });
    expect(result.attemptsUsed).toBe(1);
    expect(result.guesses).toHaveLength(1);
    expect(result.status).toBe("SOLVED");
  });

  it("boards and status summaries never leak the answer before completion", async () => {
    const userId = await freshUser("peeker");
    const gameDate = addGameDays(BASE_DATE, 6);
    await clearUnplayedPuzzles([gameDate]);
    const clock = clockAt(gameDate);
    await ensureDailyPuzzles(db, gameDate);
    const puzzle = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate, difficulty: "EASY" } },
      include: { answer: true },
    });
    await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: "QQQQ",
      idempotencyKey: randomUUID(),
      clock,
    });
    const board = await getBoard(db, { userId, gameDate, difficulty: "EASY" });
    expect(board.answer).toBeNull();
    expect(JSON.stringify(board)).not.toContain(puzzle.answer.word);
    const status = await getDailyStatus(db, { userId, gameDate });
    expect(status.word.EASY).toBe("IN_PROGRESS");
    expect(JSON.stringify(status)).not.toContain(puzzle.answer.word);
  });

  it("existing puzzles stay frozen; regeneration follows the active list, until played", async () => {
    const gameDate = addGameDays(BASE_DATE, 7);
    await clearUnplayedPuzzles([gameDate]);
    await ensureDailyPuzzles(db, gameDate);
    const puzzle = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate, difficulty: "EASY" } },
    });

    // Deactivating the selected answer never rewrites the existing puzzle.
    await db.dailyWordAnswer.update({
      where: { id: puzzle.answerId },
      data: { active: false },
    });
    try {
      const unchanged = await ensureDailyPuzzles(db, gameDate);
      expect(
        unchanged.find((p) => p.difficulty === "EASY")?.answerId,
      ).toBe(puzzle.answerId);

      // Regeneration (future, unplayed) re-derives from the ACTIVE list.
      const regenerated = await regenerateFuturePuzzle(db, {
        gameDate,
        difficulty: "EASY",
        today: BASE_DATE,
      });
      expect(regenerated.answerId).not.toBe(puzzle.answerId);
      const list = await activeList("EASY");
      expect(regenerated.answerId).toBe(
        list[rotationIndex(gameDate, list.length)]?.id,
      );
    } finally {
      await db.dailyWordAnswer.update({
        where: { id: puzzle.answerId },
        data: { active: true },
      });
    }

    // Preview shows without exposing; reward edits work on unplayed rows.
    const preview = await previewPuzzles(db, gameDate);
    expect(preview).toHaveLength(3);
    await setFuturePuzzleReward(db, {
      gameDate,
      difficulty: "EASY",
      rewardCoins: 123n,
      today: BASE_DATE,
    });

    // Playing freezes everything.
    const userId = await freshUser("freezer");
    await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: "QQQQ",
      idempotencyKey: randomUUID(),
      clock: clockAt(gameDate),
    });
    await expect(
      regenerateFuturePuzzle(db, { gameDate, difficulty: "EASY", today: BASE_DATE }),
    ).rejects.toThrowError(/PUZZLE_ALREADY_PLAYED/);
    await expect(
      setFuturePuzzleReward(db, {
        gameDate,
        difficulty: "EASY",
        rewardCoins: 5n,
        today: BASE_DATE,
      }),
    ).rejects.toThrowError(/PUZZLE_ALREADY_PLAYED/);
    await expect(
      regenerateFuturePuzzle(db, {
        gameDate: BASE_DATE,
        difficulty: "EASY",
        today: BASE_DATE,
      }),
    ).rejects.toThrowError(/PUZZLE_NOT_FUTURE/);
  });

  it("appending a new answer extends the rotation without renumbering", async () => {
    const beforeRows = await db.dailyWordAnswer.findMany({
      where: { difficulty: "EASY", sequencePosition: { lt: 1000 } },
    });
    const appended = {
      ...wordAnswers,
      EASY: [...wordAnswers.EASY, "XYZW"],
    };
    await seedWordAnswers(db, appended, new SeedReport());
    try {
      for (const row of beforeRows) {
        const after = await db.dailyWordAnswer.findUniqueOrThrow({
          where: { id: row.id },
        });
        expect(after.sequencePosition).toBe(row.sequencePosition);
      }
      const added = await db.dailyWordAnswer.findUniqueOrThrow({
        where: { difficulty_word: { difficulty: "EASY", word: "XYZW" } },
      });
      expect(added.sequencePosition).toBe(100);
      expect(added.active).toBe(true);
    } finally {
      // Restore the canonical rotation and drop the fixture word.
      await seedWordAnswers(db, wordAnswers, new SeedReport());
      await db.dailyWordAnswer.delete({
        where: { difficulty_word: { difficulty: "EASY", word: "XYZW" } },
      });
    }
    expect(await db.dailyWordAnswer.count({ where: { difficulty: "EASY", active: true } })).toBe(100);
  });

  it("no active answers fails safely with an operator-visible error", async () => {
    const gameDate = addGameDays(BASE_DATE, 8);
    await clearUnplayedPuzzles([gameDate]);
    await db.dailyWordAnswer.updateMany({
      where: { difficulty: "HARD" },
      data: { active: false },
    });
    try {
      await expect(ensureDailyPuzzles(db, gameDate)).rejects.toThrowError(
        PuzzlePoolEmptyError,
      );
    } finally {
      await seedWordAnswers(db, wordAnswers, new SeedReport());
    }
  });
});
