import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import type { GameDate } from "../game-day";
import { DEFAULT_WHEEL_SLUG } from "./spin";

/**
 * Read-only wheel view. Segment weights are included so the rendered
 * segment sizes reflect relative likelihood (numeric odds are not shown as
 * text); nothing here reveals random state or tomorrow's outcomes.
 */
export interface WheelSegmentView {
  prizeId: string;
  label: string;
  weight: number;
  displayOrder: number;
  rewardType: "COINS" | "ITEM_POOL" | "NOTHING";
  coinAmount: string | null;
}

export interface WheelView {
  wheelSlug: string;
  wheelName: string;
  available: boolean;
  segments: WheelSegmentView[];
  todaysSpin: {
    prizeId: string;
    prizeLabel: string;
    flavorText: string;
    rewardType: "COINS" | "ITEM" | "NOTHING";
    coinsAwarded: string;
    itemSlug: string | null;
    itemName: string | null;
    itemArtKey: string | null;
    itemCategorySlug: string | null;
    itemQuantity: number | null;
  } | null;
}

export async function getWheelView(
  db: DbReader,
  {
    userId,
    gameDate,
    wheelSlug = DEFAULT_WHEEL_SLUG,
  }: { userId: string; gameDate: GameDate; wheelSlug?: string },
): Promise<WheelView | null> {
  const wheel = await db.dailyWheel.findUnique({ where: { slug: wheelSlug } });
  if (!wheel) {
    return null;
  }
  const configuration = await db.dailyWheelConfiguration.findFirst({
    where: { wheelId: wheel.id, active: true },
    orderBy: { version: "desc" },
    include: {
      prizes: { where: { active: true }, orderBy: { displayOrder: "asc" } },
    },
  });
  const spin = await db.dailyWheelSpin.findUnique({
    where: {
      userId_wheelId_gameDate: { userId, wheelId: wheel.id, gameDate },
    },
    include: {
      prize: { select: { label: true, flavorText: true, resultType: true } },
      awardedItem: {
        select: {
          slug: true,
          name: true,
          artKey: true,
          category: { select: { slug: true } },
        },
      },
    },
  });

  return {
    wheelSlug,
    wheelName: wheel.name,
    available: wheel.active && (configuration?.prizes.length ?? 0) > 0,
    segments:
      configuration?.prizes.map((prize) => ({
        prizeId: prize.id,
        label: prize.label,
        weight: prize.weight,
        displayOrder: prize.displayOrder,
        rewardType: prize.resultType,
        coinAmount:
          prize.coinAmount !== null ? coinsToJSON(prize.coinAmount) : null,
      })) ?? [],
    todaysSpin: spin
      ? {
          prizeId: spin.prizeId,
          prizeLabel: spin.prize.label,
          flavorText: spin.prize.flavorText,
          rewardType:
            spin.prize.resultType === "NOTHING"
              ? "NOTHING"
              : spin.awardedItem
                ? "ITEM"
                : "COINS",
          coinsAwarded: coinsToJSON(spin.awardedCoins),
          itemSlug: spin.awardedItem?.slug ?? null,
          itemName: spin.awardedItem?.name ?? null,
          itemArtKey: spin.awardedItem?.artKey ?? null,
          itemCategorySlug: spin.awardedItem?.category?.slug ?? null,
          itemQuantity: spin.awardedQuantity,
        }
      : null,
  };
}
