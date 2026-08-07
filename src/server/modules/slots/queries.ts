import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";

/**
 * What a player is told about a token before they feed it in (ADR-49).
 *
 * The prize LADDER, not the odds — the same choice the chits make and for
 * the same reason (ADR-48). A player can see the Ninefold Compass Rose is
 * on the black drum, and which face pays it; how often that face comes up
 * three times is something they find out by working the lever.
 *
 * Every face on the drum appears here, because every face is a real prize.
 * That is enforced offline (`prisma/seed/validation.ts`): a tier's face
 * count must equal its number of winning outcomes, so this ladder is
 * complete by construction rather than by remembering to keep it so.
 *
 * The weights still exist and are still authoritative. They are simply
 * not published, and nothing in this module reads them.
 */

export interface SlotPrizeRow {
  label: string;
  kind: "COINS" | "ITEM";
  /** The drum face this outcome shows three of. */
  faceIndex: number;
  /** Serialized coins for a COINS outcome, else "0". */
  coins: string;
  itemSlug: string | null;
  itemName: string | null;
  itemArtKey: string | null;
  itemRarity: string | null;
  quantity: number;
}

export interface SlotTokenView {
  itemId: string;
  slug: string;
  name: string;
  tier: number;
  faces: number;
  /** Serialized reference price of the token itself. */
  priceJson: string;
  /**
   * Winning outcomes only, richest first. The losing row is deliberately
   * absent: a machine that lists "nothing" as a prize is being coy, and
   * the blank is announced honestly by the drums instead.
   */
  prizes: SlotPrizeRow[];
  /** The headline: the single best thing on this drum. */
  topPrize: SlotPrizeRow | null;
}

/** Roughly what an outcome is worth, for ordering the ladder. */
function worth(row: {
  kind: string;
  coinAmount: bigint | null;
  quantity: number;
  prizeItem: { price: bigint } | null;
}): bigint {
  if (row.kind === "COINS") return row.coinAmount ?? 0n;
  return (row.prizeItem?.price ?? 0n) * BigInt(row.quantity);
}

function toRow(prize: {
  label: string;
  kind: string;
  coinAmount: bigint | null;
  faceIndex: number | null;
  quantity: number;
  prizeItem: {
    slug: string;
    name: string;
    artKey: string;
    rarity: string;
  } | null;
}): SlotPrizeRow {
  return {
    label: prize.label,
    kind: prize.kind === "COINS" ? "COINS" : "ITEM",
    faceIndex: prize.faceIndex ?? 0,
    coins: coinsToJSON(prize.kind === "COINS" ? (prize.coinAmount ?? 0n) : 0n),
    itemSlug: prize.prizeItem?.slug ?? null,
    itemName: prize.prizeItem?.name ?? null,
    itemArtKey: prize.prizeItem?.artKey ?? null,
    itemRarity: prize.prizeItem?.rarity ?? null,
    quantity: prize.quantity,
  };
}

/** One token's ladder, or null if that item is not a token. */
export async function getSlotTokenView(
  db: DbReader,
  { itemId }: { itemId: string },
): Promise<SlotTokenView | null> {
  const token = await db.spinToken.findUnique({
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
  if (!token) {
    return null;
  }

  const prizes = token.prizes
    .filter((prize) => prize.kind !== "NOTHING")
    .sort((a, b) => (worth(b) > worth(a) ? 1 : worth(b) < worth(a) ? -1 : 0))
    .map(toRow);

  return {
    itemId,
    slug: token.item.slug,
    name: token.item.name,
    tier: token.tier,
    faces: token.faces,
    priceJson: coinsToJSON(token.item.price),
    prizes,
    topPrize: prizes[0] ?? null,
  };
}

export interface SlotMachineView {
  /** Every tier, cheapest first, with how many the viewer is holding. */
  tokens: Array<SlotTokenView & { owned: number }>;
}

/**
 * The whole machine, as the location page shows it.
 *
 * Every tier is listed whether or not the player holds one, because the
 * point of a five-tier machine is seeing what the tokens you do not have
 * would do. A tier the player cannot use says so and links to the counter
 * rather than hiding.
 */
export async function getSlotMachineView(
  db: DbReader,
  { userId }: { userId: string },
): Promise<SlotMachineView> {
  const tokens = await db.spinToken.findMany({
    orderBy: { tier: "asc" },
    include: {
      item: true,
      prizes: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
        include: { prizeItem: true },
      },
    },
  });
  const usable = tokens.filter(
    (token) => token.item.lifecycle === "ACTIVE" || token.item.lifecycle === "RETIRED",
  );
  const held = await db.inventoryEntry.findMany({
    where: {
      userId,
      itemId: { in: usable.map((token) => token.itemId) },
      quantity: { gt: 0 },
    },
  });
  const owned = new Map(held.map((entry) => [entry.itemId, entry.quantity]));

  return {
    tokens: usable.map((token) => {
      const prizes = token.prizes
        .filter((prize) => prize.kind !== "NOTHING")
        .sort((a, b) => (worth(b) > worth(a) ? 1 : worth(b) < worth(a) ? -1 : 0))
        .map(toRow);
      return {
        itemId: token.itemId,
        slug: token.item.slug,
        name: token.item.name,
        tier: token.tier,
        faces: token.faces,
        priceJson: coinsToJSON(token.item.price),
        prizes,
        topPrize: prizes[0] ?? null,
        owned: owned.get(token.itemId) ?? 0,
      };
    }),
  };
}

export interface SlotHistoryRow {
  id: string;
  tokenName: string;
  label: string;
  won: boolean;
  reels: string;
  coins: string;
  itemName: string | null;
  quantity: number;
  createdAt: Date;
}

/** A player's recent pulls, newest first. Losses included. */
export async function getSlotHistory(
  db: DbReader,
  { userId, take = 20 }: { userId: string; take?: number },
): Promise<SlotHistoryRow[]> {
  const rows = await db.slotSpin.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      prize: { include: { token: { include: { item: true } } } },
      awardedItem: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    tokenName: row.prize.token.item.name,
    label: row.prize.label,
    won: row.won,
    reels: row.reels,
    coins: coinsToJSON(row.awardedCoins),
    itemName: row.awardedItem?.name ?? null,
    quantity: row.quantity,
    createdAt: row.createdAt,
  }));
}
