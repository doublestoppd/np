import type { DbReader } from "@/server/db";
import type { GameDate } from "../game-day";
import { DEFAULT_FOOD_POOL_SLUG } from "./claim";

export interface MealView {
  available: boolean;
  todaysClaim: {
    itemSlug: string;
    itemName: string;
    itemDescription: string;
    itemArtKey: string;
    itemCategorySlug: string | null;
    quantity: number;
  } | null;
}

/** Read-only meal state for the location page and status panel. */
export async function getMealView(
  db: DbReader,
  {
    userId,
    gameDate,
    poolSlug = DEFAULT_FOOD_POOL_SLUG,
  }: { userId: string; gameDate: GameDate; poolSlug?: string },
): Promise<MealView> {
  const pool = await db.dailyFoodPool.findUnique({
    where: { slug: poolSlug },
    select: {
      active: true,
      _count: { select: { entries: { where: { active: true } } } },
    },
  });
  const claim = await db.dailyFoodClaim.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
    include: {
      awardedItem: {
        select: {
          slug: true,
          name: true,
          description: true,
          artKey: true,
          category: { select: { slug: true } },
        },
      },
    },
  });
  return {
    available: (pool?.active ?? false) && (pool?._count.entries ?? 0) > 0,
    todaysClaim: claim
      ? {
          itemSlug: claim.awardedItem.slug,
          itemName: claim.awardedItem.name,
          itemDescription: claim.awardedItem.description,
          itemArtKey: claim.awardedItem.artKey,
          itemCategorySlug: claim.awardedItem.category?.slug ?? null,
          quantity: claim.awardedQuantity,
        }
      : null,
  };
}
