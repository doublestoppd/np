import type { WordDifficulty } from "@prisma/client";
import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";

/**
 * Composed daily-activity history, read directly from the three
 * activity-specific result tables (deliberately no generic execution
 * table). Cursor pagination by createdAt; ties are broken by id.
 */
export interface DailyHistoryEntry {
  id: string;
  activity: "WORD" | "WHEEL" | "MEAL";
  gameDate: string;
  createdAt: Date;
  outcome: string;
  difficulty: WordDifficulty | null;
  attemptsUsed: number | null;
  coinsAwarded: string;
  itemName: string | null;
  itemSlug: string | null;
  itemQuantity: number | null;
}

export interface DailyHistoryPage {
  entries: DailyHistoryEntry[];
  nextCursor: string | null;
}

function encodeCursor(entry: DailyHistoryEntry): string {
  return `${entry.createdAt.toISOString()}_${entry.id}`;
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const separator = cursor.indexOf("_");
  if (separator === -1) {
    return null;
  }
  const createdAt = new Date(cursor.slice(0, separator));
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }
  return { createdAt, id: cursor.slice(separator + 1) };
}

export async function getDailyHistory(
  db: DbReader,
  {
    userId,
    cursor,
    pageSize = 20,
  }: { userId: string; cursor?: string | null; pageSize?: number },
): Promise<DailyHistoryPage> {
  const decoded = cursor ? decodeCursor(cursor) : null;
  const createdBefore = decoded
    ? {
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ],
      }
    : {};

  const [words, spins, meals] = await Promise.all([
    db.dailyWordResult.findMany({
      where: { userId, ...createdBefore },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      include: { puzzle: { select: { gameDate: true, difficulty: true } } },
    }),
    db.dailyWheelSpin.findMany({
      where: { userId, ...createdBefore },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      include: {
        prize: { select: { label: true, resultType: true } },
        awardedItem: { select: { name: true, slug: true } },
      },
    }),
    db.dailyFoodClaim.findMany({
      where: { userId, ...createdBefore },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize,
      include: { awardedItem: { select: { name: true, slug: true } } },
    }),
  ]);

  const merged: DailyHistoryEntry[] = [
    ...words.map(
      (row): DailyHistoryEntry => ({
        id: row.id,
        activity: "WORD",
        gameDate: row.puzzle.gameDate,
        createdAt: row.createdAt,
        outcome:
          row.status === "SOLVED"
            ? "Solved"
            : row.status === "FAILED"
              ? "Not solved"
              : "In progress",
        difficulty: row.puzzle.difficulty,
        attemptsUsed: row.attemptsUsed,
        coinsAwarded: coinsToJSON(row.rewardCoins),
        itemName: null,
        itemSlug: null,
        itemQuantity: null,
      }),
    ),
    ...spins.map(
      (row): DailyHistoryEntry => ({
        id: row.id,
        activity: "WHEEL",
        gameDate: row.gameDate,
        createdAt: row.createdAt,
        outcome: row.prize.label,
        difficulty: null,
        attemptsUsed: null,
        coinsAwarded: coinsToJSON(row.awardedCoins),
        itemName: row.awardedItem?.name ?? null,
        itemSlug: row.awardedItem?.slug ?? null,
        itemQuantity: row.awardedQuantity,
      }),
    ),
    ...meals.map(
      (row): DailyHistoryEntry => ({
        id: row.id,
        activity: "MEAL",
        gameDate: row.gameDate,
        createdAt: row.createdAt,
        outcome: "Meal claimed",
        difficulty: null,
        attemptsUsed: null,
        coinsAwarded: "0",
        itemName: row.awardedItem.name,
        itemSlug: row.awardedItem.slug,
        itemQuantity: row.awardedQuantity,
      }),
    ),
  ]
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        (a.id < b.id ? 1 : -1),
    )
    .slice(0, pageSize);

  const last = merged[merged.length - 1];
  // A full page means more MAY exist; the next fetch returning empty is
  // the terminating case.
  return {
    entries: merged,
    nextCursor: merged.length === pageSize && last ? encodeCursor(last) : null,
  };
}
