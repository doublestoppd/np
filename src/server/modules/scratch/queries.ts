import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { getJackpot, type JackpotView } from "./jackpot";

/**
 * What a player is told about a chit before they scrape it (ADR-48).
 *
 * The prize LADDER, not the odds. A player can see that the Grovewarden's
 * compass is on the black chit and that the pool is real and how much it
 * currently holds; how often any of it lands is something they find out by
 * scraping salt off slate, which is the point of a scratch card.
 *
 * The weights still exist and are still authoritative — they are simply
 * not published (they were, until ADR-48; the reasoning for the change is
 * recorded there).
 */

export interface ScratchPrizeRow {
  label: string;
  kind: "COINS" | "ITEM" | "NOTHING" | "JACKPOT";
  /** Serialized coins for a COINS outcome, else "0". */
  coins: string;
  itemSlug: string | null;
  itemName: string | null;
  itemArtKey: string | null;
  itemRarity: string | null;
  quantity: number;
}

export interface ScratchCardView {
  itemId: string;
  slug: string;
  name: string;
  tier: number;
  /** Serialized reference price of the card itself. */
  priceJson: string;
  /**
   * Winning outcomes only, richest first. The losing row is deliberately
   * absent: a card that lists "nothing" as a prize is being coy, and the
   * blank is announced honestly by the reveal instead.
   */
  prizes: ScratchPrizeRow[];
  /** The headline: the single best thing on this chit. */
  topPrize: ScratchPrizeRow | null;
  jackpot: JackpotView;
}

/** Roughly what an outcome is worth, for ordering the ladder. */
function worth(row: {
  kind: string;
  coinAmount: bigint | null;
  quantity: number;
  prizeItem: { price: bigint } | null;
}): bigint {
  if (row.kind === "JACKPOT") return BigInt(Number.MAX_SAFE_INTEGER);
  if (row.kind === "COINS") return row.coinAmount ?? 0n;
  return (row.prizeItem?.price ?? 0n) * BigInt(row.quantity);
}

/** The card's prize ladder and the live pool, or null if not a card. */
export async function getScratchCardView(
  db: DbReader,
  { itemId }: { itemId: string },
): Promise<ScratchCardView | null> {
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

  const prizes = card.prizes
    .filter((prize) => prize.kind !== "NOTHING")
    .sort((a, b) => (worth(b) > worth(a) ? 1 : worth(b) < worth(a) ? -1 : 0))
    .map((prize) => ({
      label: prize.label,
      kind: prize.kind,
      coins: coinsToJSON(prize.kind === "COINS" ? (prize.coinAmount ?? 0n) : 0n),
      itemSlug: prize.prizeItem?.slug ?? null,
      itemName: prize.prizeItem?.name ?? null,
      itemArtKey: prize.prizeItem?.artKey ?? null,
      itemRarity: prize.prizeItem?.rarity ?? null,
      quantity: prize.quantity,
    })) satisfies ScratchPrizeRow[];

  return {
    itemId,
    slug: card.item.slug,
    name: card.item.name,
    tier: card.tier,
    priceJson: coinsToJSON(card.item.price),
    prizes,
    topPrize: prizes[0] ?? null,
    jackpot: await getJackpot(db),
  };
}

export interface ScratchHistoryRow {
  id: string;
  cardName: string;
  label: string;
  won: boolean;
  reveal: string;
  coins: string;
  itemName: string | null;
  quantity: number;
  createdAt: Date;
}

/** A player's recent scratches, newest first. Losses included. */
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
    won: row.won,
    reveal: row.reveal,
    coins: coinsToJSON(row.awardedCoins),
    itemName: row.awardedItem?.name ?? null,
    quantity: row.quantity,
    createdAt: row.createdAt,
  }));
}
