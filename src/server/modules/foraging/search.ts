import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Item } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { pickWeighted, secureQuantity } from "@/server/modules/daily/random";
import { ForageError } from "./errors";
import { enforceForageRateLimit } from "./config";

/**
 * JSON-safe search result (stored for idempotent replay).
 *
 * A search that turns up nothing is still a result: it used one of the
 * day's looks, it is recorded, and it has something to say.
 */
export type ForageResult = {
  spotSlug: string;
  spotName: string;
  gameDate: GameDate;
  /** 1-based position of this search within the player's day here. */
  searchOrdinal: number;
  /** Searches left at this spot today, after this one. */
  remainingToday: number;
  /** Null when the search found nothing. */
  found: {
    itemId: string;
    itemSlug: string;
    itemName: string;
    itemArtKey: string;
    itemCategorySlug: string | null;
    quantity: number;
  } | null;
  /** Shown when `found` is null. */
  flavor: string;
};

/** One line from a newline-joined flavour block, or a plain fallback. */
function pickFlavorLine(block: string): string {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return "Nothing this time.";
  }
  return lines[randomInt(0, lines.length)] as string;
}

export interface SearchSpotParams {
  userId: string;
  spotSlug: string;
  idempotencyKey: string;
  clock?: Clock;
}

/**
 * Searches a foraging spot: picks one entry from its weighted pool, grants
 * it, and records the find.
 *
 * This is the only acquisition the player initiates. Everything else in
 * the game hands them something — the meal deals an item, the wheel deals
 * a prize, the shop sells what it restocked — so a player who wanted a
 * specific thing had no move except to wait. A spot pays in ordinary
 * items and never in coins, so it cannot become a coin faucet, and its
 * pool is content: what a place yields is authored, not computed.
 *
 * The selection happens BEFORE the transaction (the same shape as the
 * daily meal), and the pool is re-checked inside it. Two guards bound the
 * day: a count, and then the unique `(userId, spotId, gameDate,
 * searchOrdinal)` row — so two concurrent searches racing for the last
 * slot collide on the constraint and exactly one commits.
 */
export async function searchSpot(
  db: DbClient,
  { userId, spotSlug, idempotencyKey, clock = systemClock }: SearchSpotParams,
): Promise<{ result: ForageResult; replayed: boolean }> {
  await enforceForageRateLimit(db, "forage-search", userId, clock.now());
  const gameDate = currentGameDate(clock);

  const spot = await db.forageSpot.findUnique({
    where: { slug: spotSlug },
    include: {
      // The location too: a ledger line reading "at The Slow Water" names
      // a spot, not a place on the map, and a player could not trace their
      // own history back to where they had been.
      location: { select: { name: true } },
      entries: {
        where: { active: true },
        include: { item: { include: { category: true } } },
      },
    },
  });
  if (!spot) {
    throw new ForageError("SPOT_NOT_FOUND");
  }
  if (!spot.active) {
    throw new ForageError("SPOT_CLOSED");
  }

  // A retired item stops appearing here rather than failing at the grant:
  // `grantItem(reason: "distribution")` refuses anything not distributable,
  // and the shelf and the write must agree (docs/conventions.md).
  const eligible = spot.entries
    .filter((entry) => isDistributable(entry.item.lifecycle))
    .map((entry) => ({ ...entry, weight: entry.selectionWeight }));
  if (eligible.length === 0) {
    log.warn("foraging.pool-empty", { spotSlug });
    throw new ForageError("NOTHING_TO_FIND");
  }

  // "Nothing" competes in the same draw as the items, so a spot's odds
  // are one table rather than a coin flip layered over a table.
  const candidates: Array<{ weight: number; entry: (typeof eligible)[number] | null }> = [
    ...eligible.map((entry) => ({ weight: entry.weight, entry })),
    ...(spot.nothingWeight > 0
      ? [{ weight: spot.nothingWeight, entry: null }]
      : []),
  ];
  const picked = pickWeighted(candidates).entry;
  const item: Item | null = picked?.item ?? null;
  const categorySlug = picked?.item.category?.slug ?? null;
  const quantity = picked
    ? secureQuantity(picked.minQuantity, picked.maxQuantity)
    : 0;
  const flavor = picked ? "" : pickFlavorLine(spot.nothingFlavor);

  return withIdempotency<ForageResult>(
    db,
    {
      userId,
      operation: "forage-search",
      key: idempotencyKey,
      requestHash: requestHash({ spotId: spot.id, gameDate }),
    },
    async (tx) => {
      const stillOpen = await tx.forageSpot.count({
        where: { id: spot.id, active: true },
      });
      if (stillOpen === 0) {
        throw new ForageError("SPOT_CLOSED");
      }

      const searchedToday = await tx.forageFind.count({
        where: { userId, spotId: spot.id, gameDate },
      });
      if (searchedToday >= spot.dailyLimit) {
        throw new ForageError("SEARCHED_OUT");
      }
      const searchOrdinal = searchedToday + 1;

      // No item moved means no ledger row: the ledger records movements,
      // and "had a look, found nothing" is not one.
      const ledger = item
        ? await recordLedger(tx, {
            userId,
            type: "FORAGE_FIND",
            itemId: item.id,
            quantity,
            note: `Found ${quantity} × ${item.name} at ${spot.name}, ${spot.location.name}`,
            metadata: { gameDate, spotSlug },
          })
        : null;

      try {
        await tx.forageFind.create({
          data: {
            userId,
            spotId: spot.id,
            gameDate,
            searchOrdinal,
            itemId: item?.id ?? undefined,
            quantity,
            transactionId: ledger?.id ?? undefined,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // Another search took this ordinal. The whole transaction rolls
          // back, so nothing was granted and nothing was logged.
          throw new ForageError("CONCURRENT_SEARCH");
        }
        throw error;
      }

      if (item && ledger) {
        await grantItem(tx, {
          userId,
          item,
          quantity,
          reason: "distribution",
          source: `foraging:${spot.slug}`,
          transactionId: ledger.id,
          now: clock.now(),
        });
      }

      log.info("foraging.searched", {
        userId,
        spot: spot.slug,
        item: item?.slug ?? null,
        quantity,
        gameDate,
      });

      return {
        spotSlug: spot.slug,
        spotName: spot.name,
        gameDate,
        searchOrdinal,
        remainingToday: Math.max(0, spot.dailyLimit - searchOrdinal),
        found: item
          ? {
              itemId: item.id,
              itemSlug: item.slug,
              itemName: item.name,
              itemArtKey: item.artKey,
              itemCategorySlug: categorySlug,
              quantity,
            }
          : null,
        flavor,
      };
    },
  );
}
