import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem, removeItem } from "@/server/modules/items/ownership";
import { isDistributable, isUsable } from "@/server/modules/items/lifecycle";
import { pickWeighted } from "@/server/modules/daily/random";
import { coinsToJSON } from "@/lib/money";
import { ScratchError } from "./errors";
import { SCRATCH_TOTAL_WEIGHT, enforceScratchRateLimit } from "./config";

/**
 * Scratching a chit (ADR-46).
 *
 * The client contributes which card and an idempotency key. What is under
 * the salt is decided here, from the card's own prize rows, with a
 * cryptographically secure weighted draw — there is no seed to guess, no
 * client field to forge, and no way to peek before committing.
 *
 * The card is consumed and the prize granted in ONE transaction, so the
 * two states that would be unfair — a card spent with nothing given, a
 * prize given with no card spent — are both unreachable. A duplicate
 * submission replays the recorded outcome rather than scratching again.
 */

export type ScratchOutcome = {
  [key: string]: string | number | boolean | null;
  cardItemId: string;
  cardName: string;
  prizeId: string;
  /** What the player is told they won. */
  label: string;
  kind: "COINS" | "ITEM";
  /** Serialized coins; "0" for an item outcome. */
  coins: string;
  itemSlug: string | null;
  itemName: string | null;
  itemArtKey: string | null;
  quantity: number;
  transactionId: string | null;
};

export async function scratchCard(
  db: DbClient,
  {
    userId,
    itemId,
    idempotencyKey,
    now = new Date(),
  }: {
    userId: string;
    itemId: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<{ outcome: ScratchOutcome; replayed: boolean }> {
  await enforceScratchRateLimit(db, userId, now);

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
    throw new ScratchError("NOT_A_CARD");
  }
  // A withdrawn card is refused before anything is spent. Retired is fine
  // — you may still scratch one you already own — but DISABLED is the kill
  // switch and it means stop.
  if (!isUsable(card.item.lifecycle)) {
    throw new ScratchError("CARD_WITHDRAWN");
  }

  // The published odds and the drawn odds are the same rows. If they do
  // not add up, nobody scratches anything: a table that is mid-edit must
  // not pay out against a percentage the player was never shown.
  const total = card.prizes.reduce((sum, prize) => sum + prize.weight, 0);
  if (card.prizes.length === 0 || total !== SCRATCH_TOTAL_WEIGHT) {
    log.error("scratch.invalid-table", {
      itemId,
      slug: card.item.slug,
      total,
      prizes: card.prizes.length,
    });
    throw new ScratchError("TABLE_UNAVAILABLE");
  }

  const { result: outcome, replayed } = await withIdempotency<ScratchOutcome>(
    db,
    {
      userId,
      operation: "scratch-card",
      key: idempotencyKey,
      requestHash: requestHash({ itemId }),
    },
    async (tx) => {
      // Spend the card first, under a guarded decrement. If the player
      // does not have one this throws before anything is drawn, so a
      // failed scratch cannot consume an outcome.
      try {
        await removeItem(tx, { userId, itemId, quantity: 1 });
      } catch {
        throw new ScratchError("NONE_IN_SATCHEL");
      }
      await recordLedger(tx, {
        userId,
        type: "ITEM_USE",
        itemId,
        quantity: 1,
        note: `Scratched a ${card.item.name}`,
      });

      const prize = pickWeighted(card.prizes);
      let coins = 0n;
      let transactionId: string | null = null;
      let quantity = 0;
      let awardedItemId: string | null = null;

      if (prize.kind === "COINS") {
        coins = prize.coinAmount ?? 0n;
        const ledger = await recordLedger(tx, {
          userId,
          type: "SCRATCH_PRIZE",
          coinsDelta: coins,
          note: `${card.item.name}: ${prize.label}`,
          metadata: { cardSlug: card.item.slug, prizeId: prize.id },
        });
        await creditCoins(tx, { userId, amount: coins });
        transactionId = ledger.id;
      } else {
        const prizeItem = prize.prizeItem;
        // A prize item that has since been withdrawn pays its reference
        // value instead of nothing. The player bought a chit that listed
        // that outcome; an operator retiring the item afterwards is not
        // their problem to absorb.
        if (!prizeItem || !isDistributable(prizeItem.lifecycle)) {
          coins = prizeItem?.price ?? 0n;
          const ledger = await recordLedger(tx, {
            userId,
            type: "SCRATCH_PRIZE",
            coinsDelta: coins,
            note: `${card.item.name}: ${prize.label} (withdrawn — paid in coins)`,
            metadata: { cardSlug: card.item.slug, prizeId: prize.id },
          });
          if (coins > 0n) {
            await creditCoins(tx, { userId, amount: coins });
          }
          transactionId = ledger.id;
          await tx.scratchResult.create({
            data: {
              userId,
              prizeId: prize.id,
              awardedCoins: coins,
              transactionId,
            },
          });
          return {
            cardItemId: itemId,
            cardName: card.item.name,
            prizeId: prize.id,
            label: prize.label,
            kind: "COINS",
            coins: coinsToJSON(coins),
            itemSlug: null,
            itemName: null,
            itemArtKey: null,
            quantity: 0,
            transactionId,
          } satisfies ScratchOutcome;
        }
        quantity = prize.quantity;
        awardedItemId = prizeItem.id;
        const ledger = await recordLedger(tx, {
          userId,
          type: "SCRATCH_PRIZE",
          itemId: prizeItem.id,
          quantity,
          note: `${card.item.name}: ${prize.label}`,
          metadata: { cardSlug: card.item.slug, prizeId: prize.id },
        });
        await grantItem(tx, {
          userId,
          item: prizeItem,
          quantity,
          reason: "distribution",
          source: `scratch:${card.item.slug}`,
          transactionId: ledger.id,
          now,
        });
        transactionId = ledger.id;
      }

      await tx.scratchResult.create({
        data: {
          userId,
          prizeId: prize.id,
          awardedCoins: coins,
          awardedItemId,
          quantity,
          transactionId,
        },
      });

      return {
        cardItemId: itemId,
        cardName: card.item.name,
        prizeId: prize.id,
        label: prize.label,
        kind: prize.kind,
        coins: coinsToJSON(coins),
        itemSlug: prize.prizeItem?.slug ?? null,
        itemName: prize.prizeItem?.name ?? null,
        itemArtKey: prize.prizeItem?.artKey ?? null,
        quantity,
        transactionId,
      } satisfies ScratchOutcome;
    },
  );

  log.info("scratch.card", {
    userId,
    cardSlug: card.item.slug,
    prizeId: outcome.prizeId,
    kind: outcome.kind,
    coins: outcome.coins,
    itemSlug: outcome.itemSlug,
    replayed,
  });
  return { outcome, replayed };
}
