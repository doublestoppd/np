/**
 * Word challenge integration: the keyed per-band rotation over the
 * authored answer lists, frozen puzzles, shape-only guess validation,
 * rewards, idempotency, and concurrency.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient, WordDifficulty } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import {
  getBoard,
  getWordBoards,
  submitGuess,
  WordGameError,
} from "./game";
import {
  ensureDailyPuzzles,
  regenerateFuturePuzzle,
  getOrCreatePuzzle,
  previewPuzzles,
  setFuturePuzzleReward,
  PuzzlePoolEmptyError,
} from "./puzzles";
import { bandForUser, ROTATION_BANDS } from "../bands";
import { DIFFICULTY_CONFIG } from "./config";
import { addGameDays, startOfGameDate, type GameDate } from "../game-day";
import { wordAnswers } from "../../../../../prisma/content/daily/word-answers";
import { seedWordAnswers } from "../../../../../prisma/seed/seed-daily";
import { SeedReport } from "../../../../../prisma/seed/report";

const prefix = fixturePrefix("dword");

// A far-future anchor unique-ish per run: rotation math is deterministic
// for ANY date, and pre-test cleanup removes unplayed puzzles at the
// chosen dates so reruns and content changes cannot leave stale answers.
const RUN_OFFSET = 10_000 + Math.floor(Math.random() * 50_000);
const BASE_DATE: GameDate = addGameDays("2026-01-01", RUN_OFFSET);

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

  it("gives different bands different answers on the same day", async () => {
    // The anti-farming property, end to end: the day's puzzles are per
    // band, so one leaked answer is worth one band rather than everyone.
    const gameDate = addGameDays(BASE_DATE, 91);
    await clearUnplayedPuzzles([gameDate]);
    await ensureDailyPuzzles(db, gameDate);

    for (const difficulty of ["EASY", "MEDIUM", "HARD"] as const) {
      const rows = await db.dailyWordPuzzle.findMany({
        where: { gameDate, difficulty },
        include: { answer: true },
      });
      expect(rows).toHaveLength(ROTATION_BANDS);
      // Every band is present exactly once...
      expect(new Set(rows.map((r) => r.band)).size).toBe(ROTATION_BANDS);
      // ...and they are not all reading the same word.
      expect(new Set(rows.map((r) => r.answerId)).size).toBeGreaterThan(
        ROTATION_BANDS * 0.7,
      );
      for (const row of rows) {
        expect(row.answer.word).toHaveLength(
          DIFFICULTY_CONFIG[difficulty].length,
        );
      }
    }

    // Independent per difficulty: a band does not get the same word three
    // times over.
    const forBandZero = await db.dailyWordPuzzle.findMany({
      where: { gameDate, band: 0 },
      include: { answer: true },
    });
    expect(new Set(forBandZero.map((p) => p.answer.word)).size).toBe(3);
  });

  it("keeps a band's answer stable once created, and per-account", async () => {
    const gameDate = addGameDays(BASE_DATE, 92);
    await clearUnplayedPuzzles([gameDate]);
    const userId = await freshUser("stable");
    const band = bandForUser(userId);

    const first = await getOrCreatePuzzle(db, gameDate, "EASY", band);
    const again = await getOrCreatePuzzle(db, gameDate, "EASY", band);
    expect(again.id).toBe(first.id);
    expect(again.answerId).toBe(first.answerId);
    expect(first.band).toBe(band);
  });

  it("creates one frozen puzzle per date, difficulty, and band, even under races", async () => {
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
    // Three concurrent schedulers, one row per (difficulty, band) — the
    // unique constraint plus skipDuplicates absorb the overlap.
    expect(puzzles).toHaveLength(3 * ROTATION_BANDS);
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
      where: {
        gameDate_difficulty_band: {
          gameDate,
          difficulty: "EASY",
          band: bandForUser(userId),
        },
      },
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
      where: {
        gameDate_difficulty_band: {
          gameDate,
          difficulty: "HARD",
          band: bandForUser(userId),
        },
      },
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
      where: {
        gameDate_difficulty_band: {
          gameDate,
          difficulty: "EASY",
          band: bandForUser(userId),
        },
      },
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
    // The dashboard summary is built from the same boards, so it must not
    // leak the answer either.
    const boards = await getWordBoards(db, { userId, gameDate });
    expect(boards.find((b) => b.difficulty === "EASY")?.status).toBe(
      "IN_PROGRESS",
    );
    expect(JSON.stringify(boards)).not.toContain(puzzle.answer.word);
  });

  it("existing puzzles stay frozen; regeneration follows the active list, until played", async () => {
    const gameDate = addGameDays(BASE_DATE, 7);
    await clearUnplayedPuzzles([gameDate]);
    await ensureDailyPuzzles(db, gameDate);
    const userId = await freshUser("freezer");
    const band = bandForUser(userId);
    const puzzle = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty_band: { gameDate, difficulty: "EASY", band } },
    });

    // Deactivating the selected answer never rewrites the existing puzzle.
    await db.dailyWordAnswer.update({
      where: { id: puzzle.answerId },
      data: { active: false },
    });
    try {
      const unchanged = await ensureDailyPuzzles(db, gameDate);
      expect(
        unchanged.find((p) => p.difficulty === "EASY" && p.band === band)
          ?.answerId,
      ).toBe(puzzle.answerId);

      // Regeneration (future, unplayed) re-derives from the ACTIVE list,
      // and lands on an answer that is still in it.
      const regenerated = await regenerateFuturePuzzle(db, {
        gameDate,
        difficulty: "EASY",
        band,
        today: BASE_DATE,
      });
      expect(regenerated.answerId).not.toBe(puzzle.answerId);
      const list = await activeList("EASY");
      expect(list.map((a) => a.id)).toContain(regenerated.answerId);
    } finally {
      await db.dailyWordAnswer.update({
        where: { id: puzzle.answerId },
        data: { active: true },
      });
    }

    // Preview shows without exposing; reward edits work on unplayed rows.
    const preview = await previewPuzzles(db, gameDate, band);
    expect(preview).toHaveLength(3);
    await setFuturePuzzleReward(db, {
      gameDate,
      difficulty: "EASY",
      rewardCoins: 123n,
      today: BASE_DATE,
    });
    // Every band of the difficulty, not just the one asked about — bands
    // differ in their word and never in their pay.
    const priced = await db.dailyWordPuzzle.findMany({
      where: { gameDate, difficulty: "EASY" },
      select: { rewardCoins: true },
    });
    expect(priced).toHaveLength(ROTATION_BANDS);
    expect(priced.every((p) => p.rewardCoins === 123n)).toBe(true);

    // Playing freezes everything.
    await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: "QQQQ",
      idempotencyKey: randomUUID(),
      clock: clockAt(gameDate),
    });
    await expect(
      regenerateFuturePuzzle(db, {
        gameDate,
        difficulty: "EASY",
        band,
        today: BASE_DATE,
      }),
    ).rejects.toThrowError(/PUZZLE_ALREADY_PLAYED/);
    // One played band freezes the reward for all of them: the other 31
    // rows are untouched, but repricing them alone would leave this
    // player paid differently for the same day's puzzle.
    await expect(
      setFuturePuzzleReward(db, {
        gameDate,
        difficulty: "EASY",
        rewardCoins: 5n,
        today: BASE_DATE,
      }),
    ).rejects.toThrowError(/PUZZLE_ALREADY_PLAYED/);
    const stillPriced = await db.dailyWordPuzzle.findMany({
      where: { gameDate, difficulty: "EASY" },
      select: { rewardCoins: true },
    });
    expect(stillPriced.every((p) => p.rewardCoins === 123n)).toBe(true);
    await expect(
      regenerateFuturePuzzle(db, {
        gameDate: BASE_DATE,
        difficulty: "EASY",
        band,
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
