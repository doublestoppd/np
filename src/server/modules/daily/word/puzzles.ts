import type { DailyWordPuzzle, WordDifficulty } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { DomainError } from "@/server/errors";
import { log } from "@/server/logging";
import { assertGameDate, type GameDate } from "../game-day";
import { DIFFICULTY_CONFIG, WORD_DIFFICULTIES } from "./config";
import { ROTATION_BANDS } from "../bands";
import { rotationIndex } from "./rotation";

/**
 * Puzzle creation: one stable answer per game date, difficulty, **and
 * rotation band**, selected by the keyed rotation (rotation.ts) over that
 * difficulty's ACTIVE answers.
 *
 * The unique (gameDate, difficulty, band) constraint anchors idempotency:
 * scheduler runs, lazy fallbacks, and concurrent requests all converge on
 * one row per band — and once a puzzle row exists its answer reference
 * never changes, regardless of later content edits or a secret rotation.
 * That immutability is why rotating DAILY_ROTATION_SECRET is safe: it
 * changes what *future* puzzles resolve to and can never rewrite a board
 * somebody is already playing.
 */

export class PuzzlePoolEmptyError extends DomainError {
  constructor() {
    super(
      "PUZZLE_POOL_EMPTY",
      "Today's puzzle isn't ready. Please try again soon.",
    );
  }
}

/** The difficulty's ACTIVE answers in authored order. */
async function activeAnswerIds(
  db: DbReader,
  difficulty: WordDifficulty,
): Promise<string[]> {
  const activeAnswers = await db.dailyWordAnswer.findMany({
    where: { difficulty, active: true },
    orderBy: { sequencePosition: "asc" },
    select: { id: true },
  });
  if (activeAnswers.length === 0) {
    log.error("daily-word.no-active-answers", { difficulty });
    throw new PuzzlePoolEmptyError();
  }
  return activeAnswers.map((answer) => answer.id);
}

/** Picks one slot's answer out of an already-loaded ordered list. */
function pickAnswerId(
  answerIds: string[],
  gameDate: GameDate,
  difficulty: WordDifficulty,
  band: number,
): string {
  const index = rotationIndex(gameDate, answerIds.length, band, difficulty);
  return answerIds[index] as string;
}

/** Selects the rotation answer id for a slot from the active ordered list. */
async function selectAnswerId(
  db: DbReader,
  gameDate: GameDate,
  difficulty: WordDifficulty,
  band: number,
): Promise<string> {
  return pickAnswerId(
    await activeAnswerIds(db, difficulty),
    gameDate,
    difficulty,
    band,
  );
}

/**
 * Ensures one band's puzzle exists. Idempotent and safe under concurrency:
 * the P2002 loser re-reads the winner's row rather than failing, so two
 * players in the same band opening the page at once both get the puzzle.
 */
export async function ensurePuzzle(
  db: DbClient,
  gameDate: GameDate,
  difficulty: WordDifficulty,
  band: number,
): Promise<DailyWordPuzzle> {
  assertGameDate(gameDate);
  const existing = await db.dailyWordPuzzle.findUnique({
    where: { gameDate_difficulty_band: { gameDate, difficulty, band } },
  });
  if (existing) {
    return existing;
  }
  const answerId = await selectAnswerId(db, gameDate, difficulty, band);
  try {
    const created = await db.dailyWordPuzzle.create({
      data: {
        gameDate,
        difficulty,
        band,
        answerId,
        rewardCoins: DIFFICULTY_CONFIG[difficulty].rewardCoins,
      },
    });
    log.info("daily-word.puzzle-created", { gameDate, difficulty, band });
    return created;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.dailyWordPuzzle.findUniqueOrThrow({
        where: { gameDate_difficulty_band: { gameDate, difficulty, band } },
      });
    }
    throw error;
  }
}

/**
 * Pre-generates every band's puzzle for a game date (scheduler path).
 *
 * This is `ROTATION_BANDS × 3` rows per day rather than 3. That is the cost of
 * the per-band rotation and it is deliberately paid here, ahead of time,
 * rather than on a player's request: the lazy path creates only the one
 * row the player in front of it needs.
 *
 * Set-based rather than a loop of ensurePuzzle, because the cron calls
 * this twice on every run: one read of what already exists, one answer
 * list per difficulty, and one skipDuplicates insert of whatever is
 * missing. A repeat run inside the same day writes nothing at all.
 * skipDuplicates also means concurrent schedulers never race — there is
 * no P2002 to recover from.
 */
export async function ensureDailyPuzzles(
  db: DbClient,
  gameDate: GameDate,
): Promise<DailyWordPuzzle[]> {
  assertGameDate(gameDate);
  const existing = await db.dailyWordPuzzle.findMany({
    where: { gameDate },
    select: { difficulty: true, band: true },
  });
  const present = new Set(
    existing.map(({ difficulty, band }) => `${difficulty}:${band}`),
  );
  const missing: Array<{
    gameDate: GameDate;
    difficulty: WordDifficulty;
    band: number;
    answerId: string;
    rewardCoins: bigint;
  }> = [];
  for (const difficulty of WORD_DIFFICULTIES) {
    const bands = Array.from({ length: ROTATION_BANDS }, (_, band) => band).filter(
      (band) => !present.has(`${difficulty}:${band}`),
    );
    if (bands.length === 0) continue;
    const answerIds = await activeAnswerIds(db, difficulty);
    for (const band of bands) {
      missing.push({
        gameDate,
        difficulty,
        band,
        answerId: pickAnswerId(answerIds, gameDate, difficulty, band),
        rewardCoins: DIFFICULTY_CONFIG[difficulty].rewardCoins,
      });
    }
  }
  if (missing.length > 0) {
    await db.dailyWordPuzzle.createMany({ data: missing, skipDuplicates: true });
    log.info("daily-word.puzzles-created", { gameDate, created: missing.length });
  }
  return db.dailyWordPuzzle.findMany({ where: { gameDate } });
}

/**
 * The puzzle for one player's slot, creating just that band's row if it is
 * missing. Never pre-generates the other bands — a first visitor should
 * not pay for the whole day.
 */
export async function getOrCreatePuzzle(
  db: DbClient,
  gameDate: GameDate,
  difficulty: WordDifficulty,
  band: number,
): Promise<DailyWordPuzzle> {
  return ensurePuzzle(db, gameDate, difficulty, band);
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
    band,
    today,
  }: {
    gameDate: GameDate;
    difficulty: WordDifficulty;
    band: number;
    today: GameDate;
  },
): Promise<DailyWordPuzzle> {
  assertGameDate(gameDate);
  if (gameDate <= today) {
    throw new DomainError(
      "PUZZLE_NOT_FUTURE",
      "Only future puzzles can be regenerated.",
    );
  }
  const puzzle = await db.dailyWordPuzzle.findUnique({
    where: { gameDate_difficulty_band: { gameDate, difficulty, band } },
    include: { _count: { select: { results: true } } },
  });
  if (!puzzle) {
    return ensurePuzzle(db, gameDate, difficulty, band);
  }
  if (puzzle._count.results > 0) {
    throw new DomainError(
      "PUZZLE_ALREADY_PLAYED",
      "That puzzle has player results and cannot change.",
    );
  }
  const answerId = await selectAnswerId(db, gameDate, difficulty, band);
  const updated = await db.dailyWordPuzzle.update({
    where: { id: puzzle.id },
    data: { answerId },
  });
  log.info("daily-word.puzzle-regenerated", { gameDate, difficulty, band });
  return updated;
}

/**
 * Admin-only preview of one band's answers for a date (existing rows, or
 * the rotation selection that would be made). Never expose the returned
 * words publicly — that is the whole thing the rotation protects.
 *
 * Band-scoped rather than whole-day: dumping all 32 bands would put every
 * answer for a date in one place, recreating by operator convenience the
 * exact leak the bands exist to prevent.
 */
export async function previewPuzzles(
  db: DbClient,
  gameDate: GameDate,
  band: number,
): Promise<Array<{ difficulty: WordDifficulty; word: string; existing: boolean }>> {
  assertGameDate(gameDate);
  const preview: Array<{
    difficulty: WordDifficulty;
    word: string;
    existing: boolean;
  }> = [];
  for (const difficulty of WORD_DIFFICULTIES) {
    const existing = await db.dailyWordPuzzle.findUnique({
      where: { gameDate_difficulty_band: { gameDate, difficulty, band } },
      include: { answer: { select: { word: true } } },
    });
    if (existing) {
      preview.push({ difficulty, word: existing.answer.word, existing: true });
      continue;
    }
    const answerId = await selectAnswerId(db, gameDate, difficulty, band);
    const answer = await db.dailyWordAnswer.findUniqueOrThrow({
      where: { id: answerId },
      select: { word: true },
    });
    preview.push({ difficulty, word: answer.word, existing: false });
  }
  return preview;
}

/**
 * Admin-only: changes the reward for a future, unplayed difficulty slot.
 * History (today and earlier, or anything with results) is immutable.
 *
 * Applies to every band of that date and difficulty, because the reward is
 * a property of the difficulty and not of the rotation: bands exist so
 * players get different *words*, never different pay. Bands are
 * pre-generated first so a later lazy creation cannot quietly appear at
 * the old reward.
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
  // Pre-generate the date's rows first, so a band created lazily after
  // this returns cannot quietly appear at the old reward. Done outside
  // the transaction: creation absorbs conflicts by re-reading, and a
  // constraint violation raised inside a transaction would abort it.
  await ensureDailyPuzzles(db, gameDate);
  await db.$transaction(async (tx) => {
    // One played band freezes the reward for every band of that date and
    // difficulty. Per-row filtering would happily edit the 31 untouched
    // bands and leave the played one behind at the old rate — bands are
    // allowed to differ in their word and in nothing else.
    const played = await tx.dailyWordResult.count({
      where: { puzzle: { gameDate, difficulty } },
    });
    if (played > 0) {
      throw new DomainError(
        "PUZZLE_ALREADY_PLAYED",
        "That puzzle has player results and cannot change.",
      );
    }
    await tx.dailyWordPuzzle.updateMany({
      where: { gameDate, difficulty },
      data: { rewardCoins },
    });
  });
}
