import { createHmac } from "node:crypto";
import type { DailyWordPuzzle, WordDifficulty } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { DomainError } from "@/server/errors";
import { log } from "@/server/logging";
import { addGameDays, assertGameDate, type GameDate } from "../game-day";
import { dailySeedSecret } from "../config";
import {
  DIFFICULTY_CONFIG,
  GENERATION_VERSION,
  RECENT_ANSWER_EXCLUSION_DAYS,
  WORD_DIFFICULTIES,
} from "./config";

/**
 * Puzzle creation: one stable global answer per game date and difficulty.
 * Selection is a deterministic HMAC over (gameDate, difficulty,
 * generationVersion) keyed by a production secret, indexing into the
 * slug-sorted eligible pool minus recently used answers. The unique
 * (gameDate, difficulty) constraint anchors idempotency: scheduler runs,
 * lazy fallbacks, and concurrent requests all converge on one row, and an
 * answer never changes once the row exists.
 */

export class PuzzlePoolEmptyError extends DomainError {
  constructor() {
    super(
      "PUZZLE_POOL_EMPTY",
      "Today's puzzle isn't ready. Please try again soon.",
    );
  }
}

function deterministicIndex(
  gameDate: GameDate,
  difficulty: WordDifficulty,
  generationVersion: number,
  poolSize: number,
): number {
  const digest = createHmac("sha256", dailySeedSecret())
    .update(`daily-word:${gameDate}:${difficulty}:v${generationVersion}`)
    .digest();
  return Number(digest.readBigUInt64BE(0) % BigInt(poolSize));
}

/** Selects the answer for a slot; pure given the pool the queries return. */
async function selectAnswerWordId(
  db: DbReader,
  gameDate: GameDate,
  difficulty: WordDifficulty,
  generationVersion: number,
): Promise<string> {
  const { length } = DIFFICULTY_CONFIG[difficulty];
  const pool = await db.wordEntry.findMany({
    where: { length, eligibleAsAnswer: true, active: true },
    orderBy: { word: "asc" },
    select: { id: true },
  });
  if (pool.length === 0) {
    throw new PuzzlePoolEmptyError();
  }

  const windowStart = addGameDays(gameDate, -RECENT_ANSWER_EXCLUSION_DAYS);
  const recent = await db.dailyWordPuzzle.findMany({
    where: { difficulty, gameDate: { gte: windowStart, lt: gameDate } },
    select: { answerWordId: true },
  });
  const excluded = new Set(recent.map((row) => row.answerWordId));
  const eligible = pool.filter((entry) => !excluded.has(entry.id));
  // When the pool is smaller than the exclusion window, repetition beats
  // having no puzzle at all.
  const candidates = eligible.length > 0 ? eligible : pool;
  const index = deterministicIndex(
    gameDate,
    difficulty,
    generationVersion,
    candidates.length,
  );
  return (candidates[index] as { id: string }).id;
}

/**
 * Ensures the three puzzles exist for a game date. Idempotent and safe
 * under concurrency (P2002 losers re-read the winner's row). Used by the
 * scheduled pre-generation AND as the lazy fallback on first access.
 */
export async function ensureDailyPuzzles(
  db: DbClient,
  gameDate: GameDate,
): Promise<DailyWordPuzzle[]> {
  assertGameDate(gameDate);
  const puzzles: DailyWordPuzzle[] = [];
  for (const difficulty of WORD_DIFFICULTIES) {
    const existing = await db.dailyWordPuzzle.findUnique({
      where: { gameDate_difficulty: { gameDate, difficulty } },
    });
    if (existing) {
      puzzles.push(existing);
      continue;
    }
    const answerWordId = await selectAnswerWordId(
      db,
      gameDate,
      difficulty,
      GENERATION_VERSION,
    );
    try {
      puzzles.push(
        await db.dailyWordPuzzle.create({
          data: {
            gameDate,
            difficulty,
            answerWordId,
            rewardCoins: DIFFICULTY_CONFIG[difficulty].rewardCoins,
            generationVersion: GENERATION_VERSION,
          },
        }),
      );
      log.info("daily-word.puzzle-created", { gameDate, difficulty });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        puzzles.push(
          await db.dailyWordPuzzle.findUniqueOrThrow({
            where: { gameDate_difficulty: { gameDate, difficulty } },
          }),
        );
        continue;
      }
      throw error;
    }
  }
  return puzzles;
}

/** The puzzle for a slot, creating the day's puzzles lazily if missing. */
export async function getOrCreatePuzzle(
  db: DbClient,
  gameDate: GameDate,
  difficulty: WordDifficulty,
): Promise<DailyWordPuzzle> {
  const existing = await db.dailyWordPuzzle.findUnique({
    where: { gameDate_difficulty: { gameDate, difficulty } },
  });
  if (existing) {
    return existing;
  }
  await ensureDailyPuzzles(db, gameDate);
  return db.dailyWordPuzzle.findUniqueOrThrow({
    where: { gameDate_difficulty: { gameDate, difficulty } },
  });
}

/**
 * Admin-only: regenerates a FUTURE, UNPLAYED puzzle after a content fix
 * (e.g. the scheduled answer was deactivated). Bumps the generation
 * version so the HMAC re-derives even from an unchanged pool. Refuses to
 * touch puzzles with any player result — answers are frozen the moment
 * play begins.
 */
export async function regenerateFuturePuzzle(
  db: DbClient,
  {
    gameDate,
    difficulty,
    today,
  }: { gameDate: GameDate; difficulty: WordDifficulty; today: GameDate },
): Promise<DailyWordPuzzle> {
  assertGameDate(gameDate);
  if (gameDate <= today) {
    throw new DomainError(
      "PUZZLE_NOT_FUTURE",
      "Only future puzzles can be regenerated.",
    );
  }
  const puzzle = await db.dailyWordPuzzle.findUnique({
    where: { gameDate_difficulty: { gameDate, difficulty } },
    include: { _count: { select: { results: true } } },
  });
  if (!puzzle) {
    await ensureDailyPuzzles(db, gameDate);
    return db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate, difficulty } },
    });
  }
  if (puzzle._count.results > 0) {
    throw new DomainError(
      "PUZZLE_ALREADY_PLAYED",
      "That puzzle has player results and cannot change.",
    );
  }
  const nextVersion = puzzle.generationVersion + 1;
  const answerWordId = await selectAnswerWordId(
    db,
    gameDate,
    difficulty,
    nextVersion,
  );
  const updated = await db.dailyWordPuzzle.update({
    where: { id: puzzle.id },
    data: { answerWordId, generationVersion: nextVersion },
  });
  log.info("daily-word.puzzle-regenerated", {
    gameDate,
    difficulty,
    generationVersion: nextVersion,
  });
  return updated;
}

/**
 * Admin-only preview of a date's answers (existing rows, or the selection
 * that would be made). Never expose the returned words publicly.
 */
export async function previewPuzzles(
  db: DbClient,
  gameDate: GameDate,
): Promise<Array<{ difficulty: WordDifficulty; word: string; existing: boolean }>> {
  assertGameDate(gameDate);
  const preview: Array<{
    difficulty: WordDifficulty;
    word: string;
    existing: boolean;
  }> = [];
  for (const difficulty of WORD_DIFFICULTIES) {
    const existing = await db.dailyWordPuzzle.findUnique({
      where: { gameDate_difficulty: { gameDate, difficulty } },
      include: { answerWord: { select: { word: true } } },
    });
    if (existing) {
      preview.push({
        difficulty,
        word: existing.answerWord.word,
        existing: true,
      });
      continue;
    }
    const answerWordId = await selectAnswerWordId(
      db,
      gameDate,
      difficulty,
      GENERATION_VERSION,
    );
    const word = await db.wordEntry.findUniqueOrThrow({
      where: { id: answerWordId },
      select: { word: true },
    });
    preview.push({ difficulty, word: word.word, existing: false });
  }
  return preview;
}

/**
 * Admin-only: changes the reward for a future, unplayed puzzle. History
 * (today and earlier, or anything with results) is immutable.
 */
export async function setFuturePuzzleReward(
  db: DbClient,
  {
    gameDate,
    difficulty,
    rewardCoins,
    today,
  }: {
    gameDate: GameDate;
    difficulty: WordDifficulty;
    rewardCoins: bigint;
    today: GameDate;
  },
): Promise<void> {
  assertGameDate(gameDate);
  if (gameDate <= today) {
    throw new DomainError(
      "PUZZLE_NOT_FUTURE",
      "Only future rewards can change.",
    );
  }
  if (rewardCoins < 0n) {
    throw new DomainError("INVALID_REWARD", "Rewards cannot be negative.");
  }
  const puzzle = await getOrCreatePuzzle(db, gameDate, difficulty);
  const updated = await db.dailyWordPuzzle.updateMany({
    where: { id: puzzle.id, results: { none: {} } },
    data: { rewardCoins },
  });
  if (updated.count === 0) {
    throw new DomainError(
      "PUZZLE_ALREADY_PLAYED",
      "That puzzle has player results and cannot change.",
    );
  }
}
