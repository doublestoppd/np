import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { SCRATCH_TOTAL_WEIGHT } from "./config";

/**
 * The published odds.
 *
 * These are read from the same rows the draw uses, so the table a player
 * is shown is arithmetically the table they are playing — there is no
 * second copy to drift. Showing them is the difference between an honest
 * game of chance and the thing the design philosophy rules out (ADR-46),
 * so this query is not optional decoration: every surface that offers a
 * scratch shows it first.
 */

export interface ScratchOddsRow {
  label: string;
  kind: "COINS" | "ITEM";
  /** Percentage of all scratches, to one decimal place. */
  chance: number;
  /** Serialized coins for a COINS outcome, else "0". */
  coins: string;
  itemSlug: string | null;
  itemName: string | null;
  itemArtKey: string | null;
  itemRarity: string | null;
  quantity: number;
}

export interface ScratchOddsView {
  itemId: string;
  slug: string;
  name: string;
  tier: number;
  /** Serialized reference price of the card itself. */
  priceJson: string;
  rows: ScratchOddsRow[];
  /**
   * Serialized expected return per scratch, valued at each prize item's
   * reference price.
   *
   * Stated plainly rather than buried: it is below the price by design
   * (validation enforces it), and a player deciding whether to spend on
   * one deserves to know that before they do, not after twenty.
   */
  expectedReturnJson: string;
}

/** The full odds table for one card, or null if the item is not a card. */
export async function getScratchOdds(
  db: DbReader,
  { itemId }: { itemId: string },
): Promise<ScratchOddsView | null> {
  const card = await db.scratchCard.findUnique({
    where: { itemId },
    include: {
      item: true,
      prizes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        include: { prizeItem: true },
      },
    },
  });
  if (!card) {
    return null;
  }
  const total =
    card.prizes.reduce((sum, prize) => sum + prize.weight, 0) ||
    SCRATCH_TOTAL_WEIGHT;

  let expected = 0n;
  const rows = card.prizes.map((prize) => {
    const value =
      prize.kind === "COINS"
        ? (prize.coinAmount ?? 0n)
        : (prize.prizeItem?.price ?? 0n) * BigInt(prize.quantity);
    expected += value * BigInt(prize.weight);
    return {
      label: prize.label,
      kind: prize.kind,
      chance: Math.round((prize.weight / total) * 1000) / 10,
      coins: coinsToJSON(prize.kind === "COINS" ? (prize.coinAmount ?? 0n) : 0n),
      itemSlug: prize.prizeItem?.slug ?? null,
      itemName: prize.prizeItem?.name ?? null,
      itemArtKey: prize.prizeItem?.artKey ?? null,
      itemRarity: prize.prizeItem?.rarity ?? null,
      quantity: prize.quantity,
    } satisfies ScratchOddsRow;
  });

  return {
    itemId,
    slug: card.item.slug,
    name: card.item.name,
    tier: card.tier,
    priceJson: coinsToJSON(card.item.price),
    rows,
    expectedReturnJson: coinsToJSON(expected / BigInt(total)),
  };
}

export interface ScratchHistoryRow {
  id: string;
  cardName: string;
  label: string;
  coins: string;
  itemName: string | null;
  quantity: number;
  createdAt: Date;
}

/** A player's recent scratches, newest first. */
export async function getScratchHistory(
  db: DbReader,
  { userId, take = 20 }: { userId: string; take?: number },
): Promise<ScratchHistoryRow[]> {
  const rows = await db.scratchResult.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      prize: { include: { card: { include: { item: true } } } },
      awardedItem: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    cardName: row.prize.card.item.name,
    label: row.prize.label,
    coins: coinsToJSON(row.awardedCoins),
    itemName: row.awardedItem?.name ?? null,
    quantity: row.quantity,
    createdAt: row.createdAt,
  }));
}
