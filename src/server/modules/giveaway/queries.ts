import type { Rarity } from "@prisma/client";
import type { DbReader } from "@/server/db";
import { systemClock, type Clock } from "@/server/clock";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { isSellable } from "@/server/modules/items/lifecycle";
import { listOwnedAssets } from "@/server/modules/items/ownership-view";
import {
  DONATIONS_PER_DAY,
  SHELF_CAPACITY,
  TAKES_PER_DAY,
  describeFreshness,
  type Freshness,
} from "./config";

/** One lot as the shelf presents it. No timers and no expiry timestamp. */
export interface ShelfLot {
  id: string;
  itemSlug: string;
  itemName: string;
  itemArtKey: string;
  itemCategorySlug: string | null;
  itemCategoryName: string | null;
  itemRarity: Rarity;
  /** Estimated value, for the same reason the satchel shows one. */
  itemPrice: bigint;
  /** How many are still unclaimed. */
  remaining: number;
  donorUsername: string;
  /** True when the viewer left this lot. */
  yours: boolean;
  /** True when the viewer has already had one from this lot. */
  alreadyTaken: boolean;
  freshness: Freshness;
}

export interface ShelfView {
  lots: ShelfLot[];
  /** Takes the viewer has left today. */
  takesLeftToday: number;
  /** Donations the viewer has left today. */
  donationsLeftToday: number;
  /** Free places on the shelf right now. */
  roomOnShelf: number;
  /** Everything the viewer could put on the shelf, cheapest name first. */
  donatable: Array<{
    itemId: string;
    name: string;
    /** How many the viewer holds. */
    held: number;
  }>;
}

/**
 * The shelf, as one player sees it.
 *
 * Expiry is applied here rather than by a sweeper: a lot is on the shelf
 * if it has not expired and has something left, and nothing anywhere
 * deletes the row. That means the shelf is correct with no cron, no job
 * runner and no scheduled task — the two mechanisms that could disagree
 * (a filter and a sweep) are one mechanism.
 *
 * Oldest first, deliberately. Newest-first would put the freshest lot at
 * the top of the page and turn the shelf into a refresh race; oldest-first
 * puts the things closest to going cold in front of the person who could
 * still use them, which is both kinder and wastes less.
 */
export async function getShelf(
  db: DbReader,
  { userId, clock = systemClock }: { userId: string; clock?: Clock },
): Promise<ShelfView> {
  const now = clock.now();
  const gameDate = currentGameDate(clock);

  const [offerings, tookToday, gaveToday, assets] = await Promise.all([
    db.giveawayOffering.findMany({
      where: {
        expiresAt: { gt: now },
        remaining: { gt: 0 },
        // The same lifecycle rule the donation was checked against. An
        // item pulled out of circulation while sitting here stops being
        // takeable — and then simply expires, which is the right direction
        // for a kill switch: fewer copies, not more.
        item: { lifecycle: { in: ["ACTIVE", "RETIRED"] }, tradeable: true },
      },
      orderBy: { offeredAt: "asc" },
      include: {
        item: { include: { category: { select: { slug: true, name: true } } } },
        donor: { select: { username: true } },
        takes: { where: { takerId: userId }, select: { id: true } },
      },
    }),
    db.giveawayTake.count({ where: { takerId: userId, gameDate } }),
    db.giveawayOffering.count({ where: { donorId: userId, gameDate } }),
    listOwnedAssets(db, userId),
  ]);

  const liveCount = await db.giveawayOffering.count({
    where: { expiresAt: { gt: now }, remaining: { gt: 0 } },
  });

  return {
    lots: offerings.map((offering) => ({
      id: offering.id,
      itemSlug: offering.item.slug,
      itemName: offering.item.name,
      itemArtKey: offering.item.artKey,
      itemCategorySlug: offering.item.category?.slug ?? null,
      itemCategoryName: offering.item.category?.name ?? null,
      itemRarity: offering.item.rarity,
      itemPrice: offering.item.price,
      remaining: offering.remaining,
      donorUsername: offering.donor.username,
      yours: offering.donorId === userId,
      alreadyTaken: offering.takes.length > 0,
      freshness: describeFreshness(offering.offeredAt, now),
    })),
    takesLeftToday: Math.max(0, TAKES_PER_DAY - tookToday),
    donationsLeftToday: Math.max(0, DONATIONS_PER_DAY - gaveToday),
    roomOnShelf: Math.max(0, SHELF_CAPACITY - liveCount),
    donatable: assets
      .filter(
        (asset) =>
          asset.kind === "stack" &&
          asset.quantity > 0 &&
          asset.item.stackable &&
          asset.item.tradeable &&
          isSellable(asset.item.lifecycle),
      )
      .map((asset) => ({
        itemId: asset.item.id,
        name: asset.item.name,
        held: asset.kind === "stack" ? asset.quantity : 1,
      })),
  };
}
