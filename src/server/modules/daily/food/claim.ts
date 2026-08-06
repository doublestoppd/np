import type { Item } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { DomainError } from "@/server/errors";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { recordSecurityEvent } from "@/server/security/audit";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import { currentGameDate, type GameDate } from "../game-day";
import { enforceDailyRateLimit } from "../config";
import { pickWeighted } from "../random";

export const DEFAULT_FOOD_POOL_SLUG = "hearth-and-ladle";

export class FoodClaimError extends DomainError {}

export type MealClaimResult = {
  gameDate: GameDate;
  itemId: string;
  itemSlug: string;
  itemName: string;
  quantity: number;
  rewardTransactionId: string | null;
  /** True when this call returned a previously recorded claim. */
  alreadyClaimed: boolean;
};

async function recordedClaim(
  db: DbReader,
  userId: string,
  gameDate: GameDate,
): Promise<MealClaimResult | null> {
  const claim = await db.dailyFoodClaim.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
    include: { awardedItem: { select: { id: true, slug: true, name: true } } },
  });
  if (!claim) {
    return null;
  }
  return {
    gameDate,
    itemId: claim.awardedItem.id,
    itemSlug: claim.awardedItem.slug,
    itemName: claim.awardedItem.name,
    quantity: claim.awardedQuantity,
    rewardTransactionId: claim.rewardTransactionId,
    alreadyClaimed: true,
  };
}

/**
 * Atomic daily meal claim: the unique (userId, gameDate) claim row is
 * created before the item grant, both commit together, and every retry —
 * same key or not — returns the originally recorded item rather than
 * selecting another.
 */
export async function claimDailyMeal(
  db: DbClient,
  {
    userId,
    poolSlug = DEFAULT_FOOD_POOL_SLUG,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    poolSlug?: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<MealClaimResult> {
  await enforceDailyRateLimit(db, "daily-food-claim", userId, clock.now());
  const gameDate = currentGameDate(clock);

  const existing = await recordedClaim(db, userId, gameDate);
  if (existing) {
    return existing;
  }

  const pool = await db.dailyFoodPool.findUnique({
    where: { slug: poolSlug },
    include: { entries: { where: { active: true }, include: { item: true } } },
  });
  if (!pool || !pool.active) {
    throw new FoodClaimError("MEAL_UNAVAILABLE", "The kitchen is closed today.");
  }
  const eligible = pool.entries
    .filter(
      (entry) =>
        isDistributable(entry.item.lifecycle) && entry.item.type === "FOOD",
    )
    .map((entry) => ({ ...entry, weight: entry.selectionWeight }));
  if (eligible.length === 0) {
    log.warn("daily-food.pool-empty", { poolSlug });
    throw new FoodClaimError("MEAL_UNAVAILABLE", "The kitchen is closed today.");
  }

  const picked = pickWeighted(eligible);
  const item: Item = picked.item;
  const quantity = picked.quantity;

  try {
    const { result, replayed } = await withIdempotency<MealClaimResult>(
      db,
      {
        userId,
        operation: "daily-food-claim",
        key: idempotencyKey,
        requestHash: requestHash({ poolId: pool.id, gameDate }),
      },
      async (tx) => {
        // Re-check the pool inside the transaction: it was read (and the
        // item drawn from it) before the transaction opened, so a pool
        // closed or re-versioned in that gap would otherwise still pay out
        // and be recorded against a version that no longer describes it.
        const stillLive = await tx.dailyFoodPool.count({
          where: {
            id: pool.id,
            active: true,
            configurationVersion: pool.configurationVersion,
          },
        });
        if (stillLive === 0) {
          throw new FoodClaimError(
            "MEAL_UNAVAILABLE",
            "The kitchen is closed today.",
          );
        }

        // Claim the day first; nothing is granted unless this row commits.
        const claim = await tx.dailyFoodClaim.create({
          data: {
            userId,
            gameDate,
            poolId: pool.id,
            poolConfigurationVersion: pool.configurationVersion,
            awardedItemId: item.id,
            awardedQuantity: quantity,
            idempotencyKey,
          },
        });
        const ledger = await recordLedger(tx, {
          userId,
          type: "DAILY_FOOD_CLAIM",
          itemId: item.id,
          quantity,
          note: `Community meal: ${item.name}`,
          metadata: { gameDate, poolSlug },
        });
        await grantItem(tx, {
          userId,
          item,
          quantity,
          reason: "distribution",
          source: "daily-meal",
          transactionId: ledger.id,
          now: clock.now(),
        });
        await tx.dailyFoodClaim.update({
          where: { id: claim.id },
          data: { rewardTransactionId: ledger.id },
        });
        return {
          gameDate,
          itemId: item.id,
          itemSlug: item.slug,
          itemName: item.name,
          quantity,
          rewardTransactionId: ledger.id,
          alreadyClaimed: false,
        } satisfies MealClaimResult;
      },
    );

    if (!replayed) {
      await recordSecurityEvent(db, {
        userId,
        type: "daily-reward",
        severity: "info",
        message: `Community meal claimed (${result.itemSlug})`,
        metadata: {
          gameDate,
          itemId: result.itemId,
          quantity: result.quantity,
          transactionId: result.rewardTransactionId,
        },
      });
    }
    log.info("daily-food.claim", {
      userId,
      gameDate,
      itemSlug: result.itemSlug,
      quantity: result.quantity,
      replayed,
      rewardTransactionId: result.rewardTransactionId,
    });
    return result;
  } catch (error) {
    const lostDailyRace =
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002") ||
      (error instanceof DomainError && error.code === "OPERATION_IN_PROGRESS");
    if (lostDailyRace) {
      const recorded = await recordedClaim(db, userId, gameDate);
      if (recorded) {
        await recordSecurityEvent(db, {
          userId,
          type: "daily-duplicate-claim",
          severity: "info",
          message: "Duplicate meal claim returned the recorded item",
          metadata: { gameDate },
        });
        return recorded;
      }
    }
    throw error;
  }
}
