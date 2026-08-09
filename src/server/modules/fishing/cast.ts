import type { Item } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import {
  pickFlavorLine,
  pickWeighted,
  secureQuantity,
} from "@/server/modules/daily/random";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { enforceFishingRateLimit } from "./config";
import { FishingError } from "./errors";

/**
 * Fishing (ADR-47).
 *
 * A near relative of foraging, and the differences are the design:
 *
 * - **One fish, with a size.** A cast yields exactly one, and its length
 *   is drawn from the range that species runs to *in this water*. The
 *   size is the reason to cast again after you already own the fish.
 * - **Empty casts are common and are not failures.** The empty outcome
 *   competes in the same weighted table as the fish, so a spot's odds are
 *   one table rather than a coin flip layered over a table, and its
 *   weight is deliberately higher than a hedgerow's — waiting is what
 *   fishing is.
 * - **Personal bests are the player's own.** A longer catch updates
 *   their record and nothing else. Fishing has no daily board, and the
 *   reason is no longer a privacy rule (ADR-67 withdrew it): a catch is a
 *   draw from a weighted table, so a board of catches would rank luck.
 *
 * Like foraging, a spot pays in fish and never in coins, so it can never
 * become a coin faucet.
 */

export interface CastResult {
  [key: string]: string | number | boolean | null;
  spotSlug: string;
  spotName: string;
  gameDate: GameDate;
  castOrdinal: number;
  remainingToday: number;
  itemSlug: string | null;
  itemName: string | null;
  itemArtKey: string | null;
  /** Centimetres; 0 when the cast came back empty. */
  lengthCm: number;
  /** True when this catch beat the player's own previous best. */
  personalBest: boolean;
  /** The record this beat, if any — for "up from 34cm". */
  previousBestCm: number | null;
  /** Shown when nothing was caught. */
  flavor: string;
}


export async function castLine(
  db: DbClient,
  {
    userId,
    spotSlug,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    spotSlug: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: CastResult; replayed: boolean }> {
  await enforceFishingRateLimit(db, userId, clock.now());
  const gameDate = currentGameDate(clock);

  const spot = await db.fishingSpot.findUnique({
    where: { slug: spotSlug },
    include: {
      location: { select: { name: true } },
      entries: { where: { active: true }, include: { item: true } },
    },
  });
  if (!spot) {
    throw new FishingError("SPOT_NOT_FOUND");
  }
  if (!spot.active) {
    throw new FishingError("SPOT_CLOSED");
  }

  // A retired species stops appearing rather than failing at the grant:
  // grantItem(reason: "distribution") refuses anything not distributable,
  // and the table and the write must agree.
  const eligible = spot.entries.filter((entry) =>
    isDistributable(entry.item.lifecycle),
  );
  if (eligible.length === 0) {
    log.warn("fishing.table-empty", { spotSlug });
    throw new FishingError("NOTHING_BITING");
  }

  const candidates: Array<{
    weight: number;
    entry: (typeof eligible)[number] | null;
  }> = [
    ...eligible.map((entry) => ({ weight: entry.selectionWeight, entry })),
    ...(spot.emptyWeight > 0
      ? [{ weight: spot.emptyWeight, entry: null }]
      : []),
  ];
  const picked = pickWeighted(candidates).entry;
  const item: Item | null = picked?.item ?? null;
  // The size, drawn once here and then immutable. Two players landing the
  // same species on the same day get different fish, which is the point.
  const lengthCm = picked ? secureQuantity(picked.minLength, picked.maxLength) : 0;
  const flavor = picked ? "" : pickFlavorLine(spot.emptyFlavor);

  return withIdempotency<CastResult>(
    db,
    {
      userId,
      operation: "fishing-cast",
      key: idempotencyKey,
      requestHash: requestHash({ spotId: spot.id, gameDate }),
    },
    async (tx) => {
      const stillOpen = await tx.fishingSpot.count({
        where: { id: spot.id, active: true },
      });
      if (stillOpen === 0) {
        throw new FishingError("SPOT_CLOSED");
      }

      const castsToday = await tx.fishCatch.count({
        where: { userId, spotId: spot.id, gameDate },
      });
      if (castsToday >= spot.dailyLimit) {
        throw new FishingError("FISHED_OUT");
      }
      const castOrdinal = castsToday + 1;

      // No fish means no ledger row: the ledger records movements, and
      // "sat there for an hour" is not one.
      const ledger = item
        ? await recordLedger(tx, {
            userId,
            type: "FORAGE_FIND",
            itemId: item.id,
            quantity: 1,
            note: `Landed a ${lengthCm}cm ${item.name} at ${spot.name}, ${spot.location.name}`,
            metadata: { gameDate, spotSlug, lengthCm },
          })
        : null;

      try {
        await tx.fishCatch.create({
          data: {
            userId,
            spotId: spot.id,
            gameDate,
            castOrdinal,
            itemId: item?.id ?? undefined,
            lengthCm,
            transactionId: ledger?.id ?? undefined,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // Another cast took this ordinal. The whole transaction rolls
          // back, so nothing was granted and nothing was logged.
          throw new FishingError("CONCURRENT_CAST");
        }
        throw error;
      }

      let personalBest = false;
      let previousBestCm: number | null = null;
      if (item && ledger) {
        await grantItem(tx, {
          userId,
          item,
          quantity: 1,
          reason: "distribution",
          source: `fishing:${spot.slug}`,
          transactionId: ledger.id,
          now: clock.now(),
        });

        const existing = await tx.fishRecord.findUnique({
          where: { userId_itemId: { userId, itemId: item.id } },
        });
        previousBestCm = existing?.lengthCm ?? null;
        if (!existing) {
          await tx.fishRecord.create({
            data: { userId, itemId: item.id, lengthCm, caughtAt: clock.now() },
          });
          personalBest = true;
        } else if (lengthCm > existing.lengthCm) {
          // Guarded on the stored length so two concurrent casts cannot
          // between them install the smaller of two records.
          const raised = await tx.fishRecord.updateMany({
            where: { id: existing.id, lengthCm: { lt: lengthCm } },
            data: { lengthCm, caughtAt: clock.now() },
          });
          personalBest = raised.count > 0;
        }
      }

      log.info("fishing.cast", {
        userId,
        spot: spot.slug,
        item: item?.slug ?? null,
        lengthCm,
        personalBest,
        gameDate,
      });

      return {
        spotSlug: spot.slug,
        spotName: spot.name,
        gameDate,
        castOrdinal,
        remainingToday: Math.max(0, spot.dailyLimit - castOrdinal),
        itemSlug: item?.slug ?? null,
        itemName: item?.name ?? null,
        itemArtKey: item?.artKey ?? null,
        lengthCm,
        personalBest,
        previousBestCm,
        flavor,
      } satisfies CastResult;
    },
  );
}
