import type { DailyWheelPrize, Item } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { DbClient, DbReader } from "@/server/db";
import { DomainError } from "@/server/errors";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { recordSecurityEvent } from "@/server/security/audit";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import { coinsToJSON } from "@/lib/money";
import { currentGameDate, type GameDate } from "../game-day";
import { enforceDailyRateLimit } from "../config";
import { pickWeighted, secureQuantity } from "../random";

export const DEFAULT_WHEEL_SLUG = "brassbell-wheel";

/** Active prize weights are basis points and must sum to exactly this. */
export const WHEEL_TOTAL_WEIGHT = 10_000;

export class WheelError extends DomainError {}

export type SpinOutcome = {
  gameDate: GameDate;
  wheelSlug: string;
  prizeId: string;
  prizeLabel: string;
  flavorText: string;
  rewardType: "COINS" | "ITEM" | "NOTHING";
  coinsAwarded: string;
  itemId: string | null;
  itemSlug: string | null;
  itemName: string | null;
  itemQuantity: number | null;
  rewardTransactionId: string | null;
  /** True when this call returned a previously recorded spin. */
  alreadySpun: boolean;
};

type PrizeWithPool = DailyWheelPrize & {
  itemPool:
    | {
        active: boolean;
        entries: Array<{
          selectionWeight: number;
          minimumQuantity: number;
          maximumQuantity: number;
          active: boolean;
          item: Item;
        }>;
      }
    | null;
};

export function validatePrizeWeights(
  prizes: Array<{ weight: number; active: boolean }>,
): void {
  const total = prizes
    .filter((prize) => prize.active)
    .reduce((sum, prize) => sum + prize.weight, 0);
  if (total !== WHEEL_TOTAL_WEIGHT) {
    throw new WheelError(
      "INVALID_WHEEL_CONFIG",
      "The wheel is being adjusted. Try again soon.",
    );
  }
}

async function loadActiveConfiguration(db: DbReader, wheelId: string) {
  return db.dailyWheelConfiguration.findFirst({
    where: { wheelId, active: true },
    orderBy: { version: "desc" },
    include: {
      prizes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        include: {
          itemPool: {
            include: {
              entries: { where: { active: true }, include: { item: true } },
            },
          },
        },
      },
    },
  });
}

function spinToOutcome(
  spin: {
    gameDate: string;
    prizeId: string;
    awardedCoins: bigint;
    awardedQuantity: number | null;
    rewardTransactionId: string | null;
    prize: { label: string; flavorText: string; resultType: string };
    awardedItem: { id: string; slug: string; name: string } | null;
  },
  wheelSlug: string,
  alreadySpun: boolean,
): SpinOutcome {
  const rewardType =
    spin.prize.resultType === "NOTHING"
      ? "NOTHING"
      : spin.awardedItem
        ? "ITEM"
        : "COINS";
  return {
    gameDate: spin.gameDate,
    wheelSlug,
    prizeId: spin.prizeId,
    prizeLabel: spin.prize.label,
    flavorText: spin.prize.flavorText,
    rewardType,
    coinsAwarded: coinsToJSON(spin.awardedCoins),
    itemId: spin.awardedItem?.id ?? null,
    itemSlug: spin.awardedItem?.slug ?? null,
    itemName: spin.awardedItem?.name ?? null,
    itemQuantity: spin.awardedQuantity,
    rewardTransactionId: spin.rewardTransactionId,
    alreadySpun,
  };
}

async function recordedSpin(
  db: DbReader,
  userId: string,
  wheelId: string,
  wheelSlug: string,
  gameDate: GameDate,
): Promise<SpinOutcome | null> {
  const spin = await db.dailyWheelSpin.findUnique({
    where: { userId_wheelId_gameDate: { userId, wheelId, gameDate } },
    include: {
      prize: { select: { label: true, flavorText: true, resultType: true } },
      awardedItem: { select: { id: true, slug: true, name: true } },
    },
  });
  return spin ? spinToOutcome(spin, wheelSlug, true) : null;
}

/**
 * Atomic daily spin. The outcome is selected with secure randomness and
 * committed (spin row + ledger + grant) before any animation data returns.
 * The unique (userId, wheelId, gameDate) row is created BEFORE the reward
 * grant, so a concurrent duplicate loses the race before anything is
 * awarded; the loser — and any later call that day — receives the recorded
 * outcome rather than a second prize.
 */
export async function spinWheel(
  db: DbClient,
  {
    userId,
    wheelSlug = DEFAULT_WHEEL_SLUG,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    wheelSlug?: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<SpinOutcome> {
  await enforceDailyRateLimit(db, "daily-wheel-spin", userId, clock.now());
  const gameDate = currentGameDate(clock);

  const wheel = await db.dailyWheel.findUnique({ where: { slug: wheelSlug } });
  if (!wheel || !wheel.active) {
    throw new WheelError("WHEEL_UNAVAILABLE", "The wheel is resting today.");
  }

  const existing = await recordedSpin(db, userId, wheel.id, wheelSlug, gameDate);
  if (existing) {
    return existing;
  }

  const configuration = await loadActiveConfiguration(db, wheel.id);
  if (!configuration || configuration.prizes.length === 0) {
    throw new WheelError("WHEEL_UNAVAILABLE", "The wheel is resting today.");
  }
  validatePrizeWeights(configuration.prizes);

  // Prizes whose item pool currently has no distributable entries are
  // excluded from the draw (remaining weights renormalize implicitly).
  // This is a content problem, so it is logged for operators.
  const drawable = (configuration.prizes as PrizeWithPool[]).filter((prize) => {
    if (prize.resultType !== "ITEM_POOL") {
      return true;
    }
    // A deactivated pool is a working kill switch: it draws nothing, the
    // same way the community meal honors its pool's active flag.
    if (prize.itemPool && !prize.itemPool.active) {
      return false;
    }
    const eligible = prize.itemPool?.entries.filter((entry) =>
      isDistributable(entry.item.lifecycle),
    );
    if (!eligible || eligible.length === 0) {
      log.warn("daily-wheel.pool-empty", { wheelSlug, prizeId: prize.id });
      return false;
    }
    return true;
  });
  if (drawable.length === 0) {
    throw new WheelError("WHEEL_UNAVAILABLE", "The wheel is resting today.");
  }

  // Outcome selection happens before the transaction; the transaction
  // re-checks that the configuration it was drawn from is still live, then
  // records exactly what was selected or nothing at all.
  const prize = pickWeighted(drawable);
  let awardedItem: Item | null = null;
  let awardedQuantity: number | null = null;
  if (prize.resultType === "ITEM_POOL") {
    const eligible = (prize.itemPool as NonNullable<PrizeWithPool["itemPool"]>).entries
      .filter((entry) => isDistributable(entry.item.lifecycle))
      .map((entry) => ({ ...entry, weight: entry.selectionWeight }));
    const picked = pickWeighted(eligible);
    awardedItem = picked.item;
    awardedQuantity = secureQuantity(
      picked.minimumQuantity,
      picked.maximumQuantity,
    );
  }
  const coins = prize.resultType === "COINS" ? (prize.coinAmount ?? 0n) : 0n;

  try {
    const { result, replayed } = await withIdempotency<SpinOutcome>(
      db,
      {
        userId,
        operation: "daily-wheel-spin",
        key: idempotencyKey,
        requestHash: requestHash({ wheelId: wheel.id, gameDate }),
      },
      async (tx) => {
        // Re-check the configuration inside the transaction. Everything
        // above — the wheel row, the active configuration, the prize pools
        // — was read before the transaction opened, so an operator pulling
        // a wheel or publishing a new configuration in that gap would
        // otherwise still pay out the stale draw and record it against a
        // configuration that is no longer live.
        const stillLive = await tx.dailyWheelConfiguration.count({
          where: {
            id: configuration.id,
            active: true,
            wheel: { active: true },
          },
        });
        if (stillLive === 0) {
          throw new WheelError(
            "WHEEL_UNAVAILABLE",
            "The wheel is resting today.",
          );
        }

        // Claim the day first: nothing is granted unless this row commits.
        const spin = await tx.dailyWheelSpin.create({
          data: {
            userId,
            wheelId: wheel.id,
            gameDate,
            configurationId: configuration.id,
            prizeId: prize.id,
            awardedCoins: coins,
            awardedItemId: awardedItem?.id ?? null,
            awardedQuantity,
            idempotencyKey,
          },
        });

        let rewardTransactionId: string | null = null;
        if (prize.resultType === "COINS" && coins > 0n) {
          const ledger = await recordLedger(tx, {
            userId,
            type: "DAILY_WHEEL_PRIZE",
            coinsDelta: coins,
            note: `Prize wheel: ${prize.label}`,
            metadata: { gameDate, prizeId: prize.id },
          });
          await creditCoins(tx, { userId, amount: coins });
          rewardTransactionId = ledger.id;
        } else if (prize.resultType === "ITEM_POOL" && awardedItem) {
          const ledger = await recordLedger(tx, {
            userId,
            type: "DAILY_WHEEL_PRIZE",
            itemId: awardedItem.id,
            quantity: awardedQuantity ?? 1,
            note: `Prize wheel: ${prize.label} — ${awardedItem.name}`,
            metadata: { gameDate, prizeId: prize.id },
          });
          await grantItem(tx, {
            userId,
            item: awardedItem,
            quantity: awardedQuantity ?? 1,
            reason: "distribution",
            source: "daily-wheel",
            transactionId: ledger.id,
            now: clock.now(),
          });
          rewardTransactionId = ledger.id;
        }
        if (rewardTransactionId) {
          await tx.dailyWheelSpin.update({
            where: { id: spin.id },
            data: { rewardTransactionId },
          });
        }

        return {
          gameDate,
          wheelSlug,
          prizeId: prize.id,
          prizeLabel: prize.label,
          flavorText: prize.flavorText,
          rewardType:
            prize.resultType === "NOTHING"
              ? "NOTHING"
              : awardedItem
                ? "ITEM"
                : "COINS",
          coinsAwarded: coinsToJSON(coins),
          itemId: awardedItem?.id ?? null,
          itemSlug: awardedItem?.slug ?? null,
          itemName: awardedItem?.name ?? null,
          itemQuantity: awardedQuantity,
          rewardTransactionId,
          alreadySpun: false,
        } satisfies SpinOutcome;
      },
    );

    if (!replayed && result.rewardType !== "NOTHING") {
      await recordSecurityEvent(db, {
        userId,
        type: "daily-reward",
        severity: "info",
        message: `Prize wheel reward granted (${result.prizeLabel})`,
        metadata: {
          gameDate,
          prizeId: result.prizeId,
          coins: result.coinsAwarded,
          itemId: result.itemId,
          transactionId: result.rewardTransactionId,
        },
      });
    }
    log.info("daily-wheel.spin", {
      userId,
      gameDate,
      prizeId: result.prizeId,
      rewardType: result.rewardType,
      replayed,
      rewardTransactionId: result.rewardTransactionId,
    });
    return result;
  } catch (error) {
    // A concurrent spin with a different key wins the daily unique row;
    // depending on timing that surfaces as P2002 or (via the idempotency
    // wrapper) OperationInProgressError. Either way the recorded outcome —
    // if one exists by now — is the correct response.
    const lostDailyRace =
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002") ||
      (error instanceof DomainError && error.code === "OPERATION_IN_PROGRESS");
    if (lostDailyRace) {
      const recorded = await recordedSpin(
        db,
        userId,
        wheel.id,
        wheelSlug,
        gameDate,
      );
      if (recorded) {
        await recordSecurityEvent(db, {
          userId,
          type: "daily-duplicate-claim",
          severity: "info",
          message: "Duplicate wheel spin returned the recorded outcome",
          metadata: { gameDate, wheelSlug },
        });
        return recorded;
      }
    }
    throw error;
  }
}
