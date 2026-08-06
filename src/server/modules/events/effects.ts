import type { DbTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { grantItem } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import { applyStatDecay, clampStat } from "@/server/modules/pets/pet-stats";
import { coinsToJSON } from "@/lib/money";
import { secureQuantity } from "@/server/modules/daily/random";
import type { RandomEventEffect, ResolvedEffect } from "./types";

/**
 * Declarative effect handlers.
 *
 * Every handler runs inside the roll's transaction and goes through the
 * existing economy boundaries — `creditCoins`, `recordLedger`, `grantItem`,
 * the pet stat guard — rather than writing wallets or inventories itself.
 * That is the point of the registry: a random event is one more caller of
 * the same economy, subject to the same lifecycle rules, ledger
 * requirements, and concurrency guards as a shop purchase.
 *
 * The registry is exhaustive at compile time, so adding a variant to
 * `RandomEventEffect` without a handler is a type error rather than a
 * silent no-op at runtime.
 */

export class EventEffectError extends DomainError {
  constructor(code: string, message = "That moment passed before anything came of it.") {
    super(code, message);
    this.name = "EventEffectError";
  }
}

export interface EffectContext {
  userId: string;
  /** Ledger row for this occurrence's economic half, created lazily. */
  ledgerTransactionId: string | null;
  eventKey: string;
  eventTitle: string;
  petId: string | null;
  petName: string | null;
  now: Date;
}

export interface EffectOutcome {
  resolved: ResolvedEffect;
  /** Ledger row created by this effect, if any. Threaded to the next one. */
  ledgerTransactionId?: string;
  coinsAwarded?: bigint;
}

type EffectHandler<K extends RandomEventEffect["kind"]> = (
  tx: DbTx,
  effect: Extract<RandomEventEffect, { kind: K }>,
  context: EffectContext,
) => Promise<EffectOutcome>;

const HANDLERS = {
  /**
   * Coins through the wallet with a ledger row in the same transaction, so
   * the reconciliation invariant (coins − sum(ledger deltas) = starting
   * coins) holds for event income exactly as it does for sales.
   */
  coins: async (tx, effect, context) => {
    const amount = BigInt(secureQuantity(effect.min, effect.max));
    if (amount <= 0n) {
      throw new EventEffectError("INVALID_COIN_REWARD");
    }
    const ledger = await recordLedger(tx, {
      userId: context.userId,
      type: "RANDOM_EVENT",
      coinsDelta: amount,
      note: `Random event: ${context.eventTitle}`,
      metadata: { eventKey: context.eventKey },
    });
    await creditCoins(tx, { userId: context.userId, amount });
    return {
      resolved: { kind: "coins", amount: coinsToJSON(amount) },
      ledgerTransactionId: ledger.id,
      coinsAwarded: amount,
    };
  },

  /**
   * Items through the ownership boundary with `reason: "distribution"`,
   * which re-checks lifecycle inside this transaction. A kill-switched or
   * retired item therefore cannot enter circulation through an event, and
   * the catalog gets no special exemption from the rules the shops obey.
   */
  item: async (tx, effect, context) => {
    const item = await tx.item.findUnique({ where: { slug: effect.slug } });
    if (!item) {
      throw new EventEffectError("EVENT_ITEM_MISSING");
    }
    if (!isDistributable(item.lifecycle)) {
      throw new EventEffectError("EVENT_ITEM_UNAVAILABLE");
    }
    const quantity = effect.quantity ?? 1;
    const ledger = await recordLedger(tx, {
      userId: context.userId,
      type: "RANDOM_EVENT",
      itemId: item.id,
      quantity,
      note: `Random event: ${context.eventTitle} — ${item.name}`,
      metadata: { eventKey: context.eventKey },
    });
    await grantItem(tx, {
      userId: context.userId,
      item,
      quantity,
      reason: "distribution",
      source: `random-event:${context.eventKey}`,
      transactionId: ledger.id,
      now: context.now,
    });
    return {
      resolved: { kind: "item", slug: item.slug, name: item.name, quantity },
      ledgerTransactionId: ledger.id,
    };
  },

  /**
   * Stat nudges decay-then-clamp, and write under the same
   * `statsUpdatedAt` guard feeding uses. A companion being fed in another
   * tab loses the guard, the whole event rolls back, and the player simply
   * gets no event — far better than two writers silently overwriting each
   * other's stats.
   */
  petStat: async (tx, effect, context) => {
    if (!context.petId) {
      throw new EventEffectError("EVENT_REQUIRES_PET");
    }
    const pet = await tx.pet.findUnique({ where: { id: context.petId } });
    if (!pet || pet.ownerId !== context.userId) {
      throw new EventEffectError("EVENT_REQUIRES_PET");
    }
    const current = applyStatDecay(pet, pet.statsUpdatedAt, context.now);
    const next = {
      ...current,
      [effect.stat]: clampStat(current[effect.stat] + effect.delta),
    };
    const applied = await tx.pet.updateMany({
      where: { id: pet.id, statsUpdatedAt: pet.statsUpdatedAt },
      data: { ...next, statsUpdatedAt: context.now },
    });
    if (applied.count === 0) {
      throw new EventEffectError("EVENT_PET_BUSY");
    }
    return {
      resolved: {
        kind: "petStat",
        stat: effect.stat,
        delta: effect.delta,
        petName: pet.name,
      },
    };
  },

  /** Nothing happens, on purpose. No ledger row, no mutation, no reward. */
  flavor: async () => ({ resolved: { kind: "flavor" } }),
} satisfies { [K in RandomEventEffect["kind"]]: EffectHandler<K> };

/** Applies one declarative effect and returns its frozen resolution. */
export function applyEffect(
  tx: DbTx,
  effect: RandomEventEffect,
  context: EffectContext,
): Promise<EffectOutcome> {
  // The registry is keyed by the discriminant, so the cast is narrowing a
  // union the compiler has already proven exhaustive above.
  const handler = HANDLERS[effect.kind] as EffectHandler<typeof effect.kind>;
  return handler(tx, effect as never, context);
}
