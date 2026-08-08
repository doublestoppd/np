import type { DbReader } from "@/server/db";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";

export interface CaughtTodayView {
  itemName: string;
  itemSlug: string;
  itemArtKey: string;
  lengthCm: number;
  personalBest: boolean;
  caughtAt: Date;
}

export interface FishRecordView {
  itemName: string;
  itemSlug: string;
  itemArtKey: string;
  lengthCm: number;
  caughtAt: Date;
}

export interface FishingSpotView {
  spotSlug: string;
  name: string;
  description: string;
  dailyLimit: number;
  castsToday: number;
  remainingToday: number;
  available: boolean;
  /** This player's catches here today, newest first. */
  todaysCatches: CaughtTodayView[];
}

const TODAY_LIMIT = 8;

/**
 * A spot as the player sees it. Deliberately silent about the table:
 * which fish live here, how likely each is, and how big they run is
 * something you learn by fishing. Printing it would replace the activity
 * with reading a table — the same rule foraging follows.
 */
export async function getFishingSpotView(
  db: DbReader,
  {
    userId,
    spotSlug,
    gameDate = currentGameDate(),
  }: { userId: string; spotSlug: string; gameDate?: GameDate },
): Promise<FishingSpotView | null> {
  const spot = await db.fishingSpot.findUnique({
    where: { slug: spotSlug },
    include: { _count: { select: { entries: { where: { active: true } } } } },
  });
  if (!spot) {
    return null;
  }

  const [castsToday, catches, records] = await Promise.all([
    db.fishCatch.count({ where: { userId, spotId: spot.id, gameDate } }),
    db.fishCatch.findMany({
      // Empty casts are recorded but not listed back: the strip is what
      // you landed, and a row of blanks would read as a scoreboard of
      // failure rather than as an afternoon by the water.
      where: { userId, spotId: spot.id, gameDate, itemId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: TODAY_LIMIT,
      include: { item: { select: { name: true, slug: true, artKey: true } } },
    }),
    db.fishRecord.findMany({ where: { userId } }),
  ]);
  const bestByItem = new Map(records.map((row) => [row.itemId, row.lengthCm]));

  return {
    spotSlug: spot.slug,
    name: spot.name,
    description: spot.description,
    dailyLimit: spot.dailyLimit,
    castsToday,
    remainingToday: Math.max(0, spot.dailyLimit - castsToday),
    available: spot.active && spot._count.entries > 0,
    todaysCatches: catches.map((row) => ({
      itemName: row.item?.name ?? "",
      itemSlug: row.item?.slug ?? "",
      itemArtKey: row.item?.artKey ?? "",
      lengthCm: row.lengthCm,
      // A catch is flagged as a best only if it still IS the best; a
      // later, longer one of the same species quietly takes the crown.
      personalBest:
        row.itemId !== null && bestByItem.get(row.itemId) === row.lengthCm,
      caughtAt: row.createdAt,
    })),
  };
}

/**
 * A player's own longest catch of each species, longest first.
 *
 * Private by construction. There is no variant of this that takes another
 * player's id, and there must not be: a personal best is pleasant because
 * it is yours, and a leaderboard would make it somebody else's number
 * (docs/design-philosophy.md).
 */
export async function getFishRecords(
  db: DbReader,
  { userId }: { userId: string },
): Promise<FishRecordView[]> {
  const rows = await db.fishRecord.findMany({
    where: { userId },
    orderBy: { lengthCm: "desc" },
    include: { item: { select: { name: true, slug: true, artKey: true } } },
  });
  return rows.map((row) => ({
    itemName: row.item.name,
    itemSlug: row.item.slug,
    itemArtKey: row.item.artKey,
    lengthCm: row.lengthCm,
    caughtAt: row.caughtAt,
  }));
}
