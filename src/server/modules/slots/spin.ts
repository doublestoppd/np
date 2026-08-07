import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem, removeItem } from "@/server/modules/items/ownership";
import { isDistributable, isUsable } from "@/server/modules/items/lifecycle";
import { pickWeighted } from "@/server/modules/daily/random";
import { coinsToJSON } from "@/lib/money";
import { isNearMissReels, parseReels } from "@/lib/games/slot-faces";
import { SlotError } from "./errors";
import { SLOT_TOTAL_WEIGHT, enforceSlotRateLimit } from "./config";
import { drawReels } from "./reels";

/**
 * Working the drums (ADR-49).
 *
 * The client contributes which token and an idempotency key. What the
 * drums land on is decided here, from that tier's own prize rows, with a
 * cryptographically secure weighted draw — there is no seed to guess, no
 * client field to forge, and no way to peek before committing.
 *
 * **The outcome is drawn first and the faces are dressed onto it**
 * (reels.ts). The other way round — spin three drums, read the prize off
 * them — would make the authored weights a fiction, and the real odds
 * whatever the face maths happened to produce.
 *
 * The token is consumed and the prize granted in ONE transaction, so the
 * two unfair states — a token spent with nothing given, a prize given with
 * no token spent — are both unreachable. A duplicate submission replays
 * the recorded outcome, including the same three faces: a machine that
 * changed its drums on a refresh would be the one thing here a player
 * could reasonably call rigged.
 */

export type SlotOutcome = {
  [key: string]: string | number | boolean | null;
  tokenItemId: string;
  tokenName: string;
  tier: number;
  prizeId: string;
  /** What the machine says it is. */
  label: string;
  kind: "COINS" | "ITEM" | "NOTHING";
  /** True only when the three drums matched. */
  won: boolean;
  /** Where the drums stopped, as hex face indices. */
  reels: string;
  /** Serialized coins; "0" for an item or a loss. */
  coins: string;
  itemSlug: string | null;
  itemName: string | null;
  itemArtKey: string | null;
  quantity: number;
  transactionId: string | null;
};

export async function spinDrums(
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
): Promise<{ outcome: SlotOutcome; replayed: boolean }> {
  await enforceSlotRateLimit(db, userId, now);

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
    throw new SlotError("NOT_A_TOKEN");
  }
  // A withdrawn token is refused before anything is spent. RETIRED is fine
  // — you may still use one you already hold — but DISABLED is the kill
  // switch and it means stop.
  if (!isUsable(token.item.lifecycle)) {
    throw new SlotError("TOKEN_WITHDRAWN");
  }

  // The weights must add up before anything is drawn from them. A table
  // mid-edit does not pay out against odds nobody has settled on.
  const total = token.prizes.reduce((sum, prize) => sum + prize.weight, 0);
  if (token.prizes.length === 0 || total !== SLOT_TOTAL_WEIGHT) {
    log.error("slots.invalid-table", {
      itemId,
      slug: token.item.slug,
      total,
      prizes: token.prizes.length,
    });
    throw new SlotError("TABLE_UNAVAILABLE");
  }

  const { result: outcome, replayed } = await withIdempotency<SlotOutcome>(
    db,
    {
      userId,
      operation: "slot-spin",
      key: idempotencyKey,
      requestHash: requestHash({ itemId }),
    },
    async (tx) => {
      // Spend the token first, under a guarded decrement. If the player
      // does not have one this throws before anything is drawn, so a
      // failed pull cannot consume an outcome.
      try {
        await removeItem(tx, { userId, itemId, quantity: 1 });
      } catch {
        throw new SlotError("NONE_IN_SATCHEL");
      }
      await recordLedger(tx, {
        userId,
        type: "ITEM_USE",
        itemId,
        quantity: 1,
        note: `Fed a ${token.item.name} into the drums`,
      });

      const prize = pickWeighted(token.prizes);
      const won = prize.kind !== "NOTHING";
      const reels = drawReels({
        won,
        faces: token.faces,
        winningFace: prize.faceIndex,
      });

      const base = {
        tokenItemId: itemId,
        tokenName: token.item.name,
        tier: token.tier,
        prizeId: prize.id,
        label: prize.label,
        won,
        reels,
      };

      // ---- A losing pull -------------------------------------------------
      if (prize.kind === "NOTHING") {
        await tx.slotSpin.create({
          data: { userId, prizeId: prize.id, reels, won: false },
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
        } satisfies SlotOutcome;
      }

      // ---- Coins ---------------------------------------------------------
      if (prize.kind === "COINS") {
        const coins = prize.coinAmount ?? 0n;
        const ledger = await recordLedger(tx, {
          userId,
          type: "SLOT_PRIZE",
          coinsDelta: coins,
          note: `${token.item.name}: ${prize.label}`,
          metadata: { tokenSlug: token.item.slug, prizeId: prize.id },
        });
        await creditCoins(tx, { userId, amount: coins });
        await tx.slotSpin.create({
          data: {
            userId,
            prizeId: prize.id,
            awardedCoins: coins,
            reels,
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
        } satisfies SlotOutcome;
      }

      // ---- An item -------------------------------------------------------
      const prizeItem = prize.prizeItem;
      // A prize item withdrawn since the token was bought pays its
      // reference value instead of nothing. The player bought a token that
      // listed that outcome; an operator retiring the item afterwards is
      // not theirs to absorb.
      if (!prizeItem || !isDistributable(prizeItem.lifecycle)) {
        const coins = prizeItem?.price ?? 0n;
        const ledger = await recordLedger(tx, {
          userId,
          type: "SLOT_PRIZE",
          coinsDelta: coins,
          note: `${token.item.name}: ${prize.label} (withdrawn — paid in coins)`,
          metadata: { tokenSlug: token.item.slug, prizeId: prize.id },
        });
        if (coins > 0n) {
          await creditCoins(tx, { userId, amount: coins });
        }
        await tx.slotSpin.create({
          data: {
            userId,
            prizeId: prize.id,
            awardedCoins: coins,
            reels,
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
        } satisfies SlotOutcome;
      }

      const ledger = await recordLedger(tx, {
        userId,
        type: "SLOT_PRIZE",
        itemId: prizeItem.id,
        quantity: prize.quantity,
        note: `${token.item.name}: ${prize.label}`,
        metadata: { tokenSlug: token.item.slug, prizeId: prize.id },
      });
      await grantItem(tx, {
        userId,
        item: prizeItem,
        quantity: prize.quantity,
        reason: "distribution",
        source: `slots:${token.item.slug}`,
        transactionId: ledger.id,
        now,
      });
      await tx.slotSpin.create({
        data: {
          userId,
          prizeId: prize.id,
          awardedItemId: prizeItem.id,
          quantity: prize.quantity,
          reels,
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
      } satisfies SlotOutcome;
    },
  );

  log.info("slots.spin", {
    userId,
    tokenSlug: token.item.slug,
    tier: outcome.tier,
    prizeId: outcome.prizeId,
    kind: outcome.kind,
    won: outcome.won,
    nearMiss: isNearMissReels(parseReels(outcome.reels)),
    coins: outcome.coins,
    itemSlug: outcome.itemSlug,
    replayed,
  });
  return { outcome, replayed };
}
