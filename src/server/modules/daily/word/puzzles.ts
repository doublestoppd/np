import type { DailyWordPuzzle, WordDifficulty } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { DomainError } from "@/server/errors";
import { log } from "@/server/logging";
import { assertGameDate, type GameDate } from "../game-day";
import { DIFFICULTY_CONFIG, WORD_DIFFICULTIES } from "./config";
import { rotationIndex } from "./rotation";

/**
 * Puzzle creation: one stable global answer per game date and difficulty,
 * selected by the ordered rotation (rotation.ts) over each difficulty's
 * ACTIVE answers. The unique (gameDate, difficulty) constraint anchors
 * idempotency: scheduler runs, lazy fallbacks, and concurrent requests
 * all converge on one row — and once a puzzle row exists its answer
 * reference never changes, regardless of later content edits.
 */

export class PuzzlePoolEmptyError extends DomainError {
  constructor() {
    super(
      "PUZZLE_POOL_EMPTY",
      "Today's puzzle isn't ready. Please try again soon.",
    );
  }
}

/** Selects the rotation answer id for a slot from the active ordered list. */
async function selectAnswerId(
  db: DbReader,
  gameDate: GameDate,
  difficulty: WordDifficulty,
): Promise<string> {
  const activeAnswers = await db.dailyWordAnswer.findMany({
    where: { difficulty, active: true },
    orderBy: { sequencePosition: "asc" },
    select: { id: true },
  });
  if (activeAnswers.length === 0) {
    log.error("daily-word.no-active-answers", { difficulty });
    throw new PuzzlePoolEmptyError();
  }
  const index = rotationIndex(gameDate, activeAnswers.length);
  return (activeAnswers[index] as { id: string }).id;
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
    const answerId = await selectAnswerId(db, gameDate, difficulty);
    try {
      puzzles.push(
        await db.dailyWordPuzzle.create({
          data: {
            gameDate,
            difficulty,
            answerId,
            rewardCoins: DIFFICULTY_CONFIG[difficulty].rewardCoins,
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
 * Admin-only: re-derives a FUTURE, UNPLAYED puzzle from the current
 * active rotation (used after content edits change what a future date
 * should resolve to). Refuses to touch puzzles with any player result —
 * answers are frozen the moment play begins.
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
  const answerId = await selectAnswerId(db, gameDate, difficulty);
  const updated = await db.dailyWordPuzzle.update({
    where: { id: puzzle.id },
    data: { answerId },
  });
  log.info("daily-word.puzzle-regenerated", { gameDate, difficulty });
  return updated;
}

/**
 * Admin-only preview of a date's answers (existing rows, or the rotation
 * selection that would be made). Never expose the returned words publicly.
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
      include: { answer: { select: { word: true } } },
    });
    if (existing) {
      preview.push({ difficulty, word: existing.answer.word, existing: true });
      continue;
    }
    const answerId = await selectAnswerId(db, gameDate, difficulty);
    const answer = await db.dailyWordAnswer.findUniqueOrThrow({
      where: { id: answerId },
      select: { word: true },
    });
    preview.push({ difficulty, word: answer.word, existing: false });
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
