/**
 * The market's cut (ADR-55).
 *
 * A six-month economy simulation found that three of four player
 * archetypes spent **zero coins in six months**. The completionist went
 * from 200 to 200,756 and their balance never fell once. Free food
 * outpaces decay, toys are not consumed, and the player market took no
 * commission at all — the buyer's debit landed 1:1 in the seller's till,
 * so trade moved coins between players and never out of the world.
 *
 * Excluding the one archetype that gambled, sink over faucet was 0.000.
 *
 * A commission is the only sink that scales with wealth and needs no new
 * content: the more the economy trades, the more it removes. Every other
 * candidate — upkeep, consumable toys, rent — is a recurring charge, and
 * docs/design-philosophy.md does not allow the game to bill you for
 * having played it.
 *
 * ## The rules, and why each one
 *
 * **It is destroyed, not redirected.** The cut goes nowhere: no NPC till,
 * no treasury, no pool. Money that moves somewhere is not a sink, and a
 * visible pile of confiscated coins invites a feature to spend it.
 *
 * **The buyer pays the sticker price.** The commission comes out of the
 * seller's proceeds, so the number on the shelf is the number you pay.
 * Charging the buyer a fee on top would make every listed price a lie.
 *
 * **It rounds DOWN, in the seller's favour.** Integer arithmetic on
 * bigint throughout, as everywhere money is handled. A consequence worth
 * stating: any sale under 20 coins pays no commission at all, because 5%
 * of 19 rounds to nothing. That is fine. The sink exists for wealth, and
 * a player trading trinkets is not the problem it solves.
 */

/** Basis points taken from each sale. 500 = 5%. */
export const MARKET_COMMISSION_BPS = 500n;

/** Human-readable, for copy that must not drift from the constant. */
export const MARKET_COMMISSION_PERCENT = Number(MARKET_COMMISSION_BPS) / 100;

/**
 * The cut taken from one sale, rounded down.
 *
 * Never larger than the sale itself, and never negative — a caller
 * handing this a nonsense total gets zero rather than an invariant
 * violation it would have to notice later.
 */
export function marketCommission(totalPrice: bigint): bigint {
  if (totalPrice <= 0n) {
    return 0n;
  }
  return (totalPrice * MARKET_COMMISSION_BPS) / 10_000n;
}

/** What actually reaches the seller's till. */
export function proceedsAfterCommission(totalPrice: bigint): bigint {
  return totalPrice - marketCommission(totalPrice);
}
