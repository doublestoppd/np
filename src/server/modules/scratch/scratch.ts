import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem, removeItem } from "@/server/modules/items/ownership";
import { isDistributable, isUsable } from "@/server/modules/items/lifecycle";
import { pickWeighted } from "@/server/modules/daily/random";
import { coinsToJSON } from "@/lib/money";
import { parseReveal } from "@/lib/games/scratch-symbols";
import { ScratchError } from "./errors";
import { SCRATCH_TOTAL_WEIGHT, enforceScratchRateLimit } from "./config";
import { drawReveal } from "./reveal";
import { claimJackpot, contribute, ensureJackpot } from "./jackpot";

/**
 * Scratching a chit (ADR-46, reworked by ADR-48).
 *
 * The client contributes which card and an idempotency key. What is under
 * the salt is decided here, from the card's own prize rows, with a
 * cryptographically secure weighted draw — there is no seed to guess, no
 * client field to forge, and no way to peek before committing.
 *
 * **The outcome is drawn first and the marks are dressed onto it**
 * (reveal.ts). The other way round — draw three marks, read the prize off
 * them — would make the authored weights a fiction, and the real odds
 * whatever the symbol maths happened to produce.
 *
 * The card is consumed, the pool contributed to, and the prize granted in
 * ONE transaction, so the two unfair states — a card spent with nothing
 * given, a prize given with no card spent — are both unreachable. A
 * duplicate submission replays the recorded outcome, including the same
 * three marks: a card that changed its face on a refresh would be the one
 * thing here a player could reasonably call rigged.
 */

export type ScratchOutcome = {
  [key: string]: string | number | boolean | null;
  cardItemId: string;
  cardName: string;
  prizeId: string;
  /** What the card says it is. */
  label: string;
  kind: "COINS" | "ITEM" | "NOTHING" | "JACKPOT";
  /** True only when the three marks matched. */
  won: boolean;
  /** The three marks, as symbol indices. */
  reveal: string;
  /** Serialized coins; "0" for an item or a loss. */
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

  // The weights must add up before anything is drawn from them. A table
  // mid-edit does not pay out against odds nobody has settled on.
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

  await ensureJackpot(db);
  const slice = (card.item.price * BigInt(card.jackpotBps)) / 10_000n;

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
      // The slice goes in on every scratch, winners included. A pool that
      // only grew on losses would shrink exactly when it was watched.
      await contribute(tx, slice);

      const prize = pickWeighted(card.prizes);
      const won = prize.kind !== "NOTHING";
      const reveal = drawReveal({ won, jackpot: prize.kind === "JACKPOT" });

      const base = {
        cardItemId: itemId,
        cardName: card.item.name,
        prizeId: prize.id,
        label: prize.label,
        won,
        reveal,
      };

      // ---- A losing card ------------------------------------------------
      if (prize.kind === "NOTHING") {
        await tx.scratchResult.create({
          data: { userId, prizeId: prize.id, reveal, won: false },
        });
        return {
          ...base,
          kind: "NOTHING",
          coins: "0",
          itemSlug: null,
          itemName: null,
          itemArtKey: null,
          quantity: 0,
          transactionId: null,
        } satisfies ScratchOutcome;
      }

      // ---- The pool -----------------------------------------------------
      if (prize.kind === "JACKPOT") {
        const coins = await claimJackpot(tx, { userId, now });
        const ledger = await recordLedger(tx, {
          userId,
          type: "SCRATCH_PRIZE",
          coinsDelta: coins,
          note: `${card.item.name}: the pans`,
          metadata: { cardSlug: card.item.slug, prizeId: prize.id, jackpot: true },
        });
        await creditCoins(tx, { userId, amount: coins });
        await tx.scratchResult.create({
          data: {
            userId,
            prizeId: prize.id,
            awardedCoins: coins,
            reveal,
            won: true,
            transactionId: ledger.id,
          },
        });
        return {
          ...base,
          kind: "JACKPOT",
          coins: coinsToJSON(coins),
          itemSlug: null,
          itemName: null,
          itemArtKey: null,
          quantity: 0,
          transactionId: ledger.id,
        } satisfies ScratchOutcome;
      }

      // ---- Coins --------------------------------------------------------
      if (prize.kind === "COINS") {
        const coins = prize.coinAmount ?? 0n;
        const ledger = await recordLedger(tx, {
          userId,
          type: "SCRATCH_PRIZE",
          coinsDelta: coins,
          note: `${card.item.name}: ${prize.label}`,
          metadata: { cardSlug: card.item.slug, prizeId: prize.id },
        });
        await creditCoins(tx, { userId, amount: coins });
        await tx.scratchResult.create({
          data: {
            userId,
            prizeId: prize.id,
            awardedCoins: coins,
            reveal,
            won: true,
            transactionId: ledger.id,
          },
        });
        return {
          ...base,
          kind: "COINS",
          coins: coinsToJSON(coins),
          itemSlug: null,
          itemName: null,
          itemArtKey: null,
          quantity: 0,
          transactionId: ledger.id,
        } satisfies ScratchOutcome;
      }

      // ---- An item ------------------------------------------------------
      const prizeItem = prize.prizeItem;
      // A prize item withdrawn since the card was bought pays its
      // reference value instead of nothing. The player bought a chit that
      // listed that outcome; an operator retiring the item afterwards is
      // not theirs to absorb.
      if (!prizeItem || !isDistributable(prizeItem.lifecycle)) {
        const coins = prizeItem?.price ?? 0n;
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
        await tx.scratchResult.create({
          data: {
            userId,
            prizeId: prize.id,
            awardedCoins: coins,
            reveal,
            won: true,
            transactionId: ledger.id,
          },
        });
        return {
          ...base,
          kind: "COINS",
          coins: coinsToJSON(coins),
          itemSlug: null,
          itemName: null,
          itemArtKey: null,
          quantity: 0,
          transactionId: ledger.id,
        } satisfies ScratchOutcome;
      }

      const ledger = await recordLedger(tx, {
        userId,
        type: "SCRATCH_PRIZE",
        itemId: prizeItem.id,
        quantity: prize.quantity,
        note: `${card.item.name}: ${prize.label}`,
        metadata: { cardSlug: card.item.slug, prizeId: prize.id },
      });
      await grantItem(tx, {
        userId,
        item: prizeItem,
        quantity: prize.quantity,
        reason: "distribution",
        source: `scratch:${card.item.slug}`,
        transactionId: ledger.id,
        now,
      });
      await tx.scratchResult.create({
        data: {
          userId,
          prizeId: prize.id,
          awardedItemId: prizeItem.id,
          quantity: prize.quantity,
          reveal,
          won: true,
          transactionId: ledger.id,
        },
      });
      return {
        ...base,
        kind: "ITEM",
        coins: "0",
        itemSlug: prizeItem.slug,
        itemName: prizeItem.name,
        itemArtKey: prizeItem.artKey,
        quantity: prize.quantity,
        transactionId: ledger.id,
      } satisfies ScratchOutcome;
    },
  );

  log.info("scratch.card", {
    userId,
    cardSlug: card.item.slug,
    prizeId: outcome.prizeId,
    kind: outcome.kind,
    won: outcome.won,
    nearMiss: !outcome.won && new Set(parseReveal(outcome.reveal)).size === 2,
    coins: outcome.coins,
    itemSlug: outcome.itemSlug,
    replayed,
  });
  return { outcome, replayed };
}
