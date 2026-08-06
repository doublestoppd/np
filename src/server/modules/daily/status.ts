import type { WordDifficulty } from "@prisma/client";
import type { DbReader } from "@/server/db";
import type { GameDate } from "./game-day";
import { WORD_DIFFICULTIES } from "./word/config";
import { DEFAULT_WHEEL_SLUG } from "./wheel/spin";

/**
 * Read-only "today at a glance" summary for the home panel. Reports
 * without mutating: no puzzles are created and nothing is claimed here.
 */
export type WordSlotStatus = "AVAILABLE" | "IN_PROGRESS" | "SOLVED" | "FAILED";

export interface DailyStatusSummary {
  gameDate: GameDate;
  word: Record<WordDifficulty, WordSlotStatus>;
  wordCompleted: number;
  wheel: "AVAILABLE" | "COMPLETED";
  meal: "AVAILABLE" | "CLAIMED";
}

export async function getDailyStatus(
  db: DbReader,
  { userId, gameDate }: { userId: string; gameDate: GameDate },
): Promise<DailyStatusSummary> {
  const word = Object.fromEntries(
    WORD_DIFFICULTIES.map((difficulty) => [difficulty, "AVAILABLE"]),
  ) as Record<WordDifficulty, WordSlotStatus>;

  const results = await db.dailyWordResult.findMany({
    where: { userId, puzzle: { gameDate } },
    select: {
      status: true,
      attemptsUsed: true,
      puzzle: { select: { difficulty: true } },
    },
  });
  for (const result of results) {
    word[result.puzzle.difficulty] =
      result.status === "IN_PROGRESS"
        ? result.attemptsUsed > 0
          ? "IN_PROGRESS"
          : "AVAILABLE"
        : result.status;
  }

  const wheel = await db.dailyWheelSpin.findFirst({
    where: { userId, gameDate, wheel: { slug: DEFAULT_WHEEL_SLUG } },
    select: { id: true },
  });
  const meal = await db.dailyFoodClaim.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
    select: { id: true },
  });

  return {
    gameDate,
    word,
    wordCompleted: Object.values(word).filter(
      (status) => status === "SOLVED" || status === "FAILED",
    ).length,
    wheel: wheel ? "COMPLETED" : "AVAILABLE",
    meal: meal ? "CLAIMED" : "AVAILABLE",
  };
}
