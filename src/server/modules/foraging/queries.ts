import type { DbReader } from "@/server/db";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";

export interface RecentFindView {
  itemName: string;
  itemSlug: string;
  itemArtKey: string;
  itemCategorySlug: string | null;
  quantity: number;
  foundAt: Date;
}

export interface ForageSpotView {
  spotSlug: string;
  name: string;
  description: string;
  /** Content-configured searches per player per UTC day. */
  dailyLimit: number;
  searchedToday: number;
  remainingToday: number;
  /** Open for business: active, and with something in the pool. */
  available: boolean;
  /** This player's finds here today, newest first. */
  todaysFinds: RecentFindView[];
}

const TODAY_LIMIT = 6;

/**
 * A spot as the player sees it. Read-only, and deliberately silent about
 * the pool: which items a place yields, and how likely each is, is
 * something you learn by looking — publishing the table would turn
 * foraging into a spreadsheet.
 */
export async function getSpotView(
  db: DbReader,
  {
    userId,
    spotSlug,
    gameDate = currentGameDate(),
  }: { userId: string; spotSlug: string; gameDate?: GameDate },
): Promise<ForageSpotView | null> {
  const spot = await db.forageSpot.findUnique({
    where: { slug: spotSlug },
    include: { _count: { select: { entries: { where: { active: true } } } } },
  });
  if (!spot) {
    return null;
  }

  const [searchedToday, finds] = await Promise.all([
    db.forageFind.count({ where: { userId, spotId: spot.id, gameDate } }),
    db.forageFind.findMany({
      // Empty-handed searches are recorded but not displayed back: the
      // strip is what you came away with, and a row of blanks would read
      // as a scoreboard of failure.
      where: { userId, spotId: spot.id, gameDate, itemId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: TODAY_LIMIT,
      include: {
        item: {
          select: {
            slug: true,
            name: true,
            artKey: true,
            category: { select: { slug: true } },
          },
        },
      },
    }),
  ]);

  return {
    spotSlug: spot.slug,
    name: spot.name,
    description: spot.description,
    dailyLimit: spot.dailyLimit,
    searchedToday,
    remainingToday: Math.max(0, spot.dailyLimit - searchedToday),
    available: spot.active && spot._count.entries > 0,
    todaysFinds: finds.flatMap((find) =>
      find.item
        ? [
            {
              itemName: find.item.name,
              itemSlug: find.item.slug,
              itemArtKey: find.item.artKey,
              itemCategorySlug: find.item.category?.slug ?? null,
              quantity: find.quantity,
              foundAt: find.createdAt,
            },
          ]
        : [],
    ),
  };
}
