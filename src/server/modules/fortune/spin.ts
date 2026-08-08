import { randomInt } from "node:crypto";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { creditCoins, debitCoins } from "@/server/modules/commerce/wallet";
import { EconomyError } from "@/server/modules/commerce/errors";
import { coinsToJSON } from "@/lib/money";
import {
  coinsFor,
  evaluate,
  STOPS,
  symbolAt,
  type Symbol,
} from "@/lib/games/fortune/reels";
import {
  claimFortuneJackpot,
  contributeToFortune,
  ensureFortuneJackpot,
} from "./jackpot";
import {
  isValidStake,
  JACKPOT_FEED_BPS,
  TOP_STAKE,
  enforceFortuneRateLimit,
} from "./config";
import { FortuneError } from "./errors";

/**
 * Pulling the Fortune Engine (ADR-66). SERVER ONLY.
 *
 * The order of events is the whole design:
 *
 * 1. Take the stake. Guarded, so a player who cannot afford it is refused
 *    before anything is drawn — a failed pull must never consume an
 *    outcome, which is the trap the chits record.
 * 2. Feed the pool, if this is a top-stake pull. On winners too: a pool
 *    that only grew on losses would shrink exactly when it was watched.
 * 3. Spin three real reels and READ the paytable off them. Nothing is
 *    dressed after the fact, so the reels on screen and the coins paid
 *    cannot disagree — see the note in lib/games/fortune/reels.ts.
 * 4. Pay.
 *
 * All of it in one transaction, and all of it inside the idempotent body,
 * so a double-tapped pull returns the first pull's reels rather than
 * spinning again and charging twice.
 */

/**
 * A type alias rather than an interface on purpose: `withIdempotency`
 * stores the result as JSON, and TypeScript will not let an interface
 * satisfy an index signature — an alias it will.
 */
export type SpinResult = {
  /** What the reels stopped on, left to right. */
  symbols: Symbol[];
  /** Which paytable line paid, or "" for a losing pull. */
  line: string;
  /** Serialized coins staked and coins paid. */
  stake: string;
  payout: string;
  /** True only for three moons at the top stake. */
  jackpot: boolean;
  /** The player's balance after the pull, so the UI never guesses. */
  balance: string;
};

/** One stop per reel, from the system's cryptographic source. */
function spinReels(): Symbol[] {
  return [0, 1, 2].map((reel) => symbolAt(reel, randomInt(0, STOPS)));
}

export async function spinFortune(
  db: DbClient,
  {
    userId,
    stake,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    stake: bigint;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: SpinResult; replayed: boolean }> {
  if (!isValidStake(stake)) throw new FortuneError("BAD_STAKE");

  const now = clock.now();
  await enforceFortuneRateLimit(db, userId, now);
  await ensureFortuneJackpot(db);

  const topStake = stake === TOP_STAKE;
  const slice = topStake ? (stake * JACKPOT_FEED_BPS) / 10_000n : 0n;

  return withIdempotency<SpinResult>(
    db,
    {
      userId,
      operation: "fortune-spin",
      // The stake is part of the request, so a replayed key with a
      // different stake is a mismatch rather than a silent re-read of a
      // cheaper pull.
      key: idempotencyKey,
      requestHash: requestHash({ stake: stake.toString() }),
    },
    async (tx) => {
      try {
        await debitCoins(tx, { userId, amount: stake });
      } catch (error) {
        // The wallet's own refusal, translated. Anything else is a real
        // fault and must not be reported to the player as "no coins".
        if (
          error instanceof EconomyError &&
          error.economyCode === "INSUFFICIENT_FUNDS"
        ) {
          throw new FortuneError("NOT_ENOUGH_COINS");
        }
        throw error;
      }
      const staked = await recordLedger(tx, {
        userId,
        type: "FORTUNE_STAKE",
        coinsDelta: -stake,
        note: `Fortune Engine, ${stake} staked`,
      });

      await contributeToFortune(tx, slice);

      const symbols = spinReels();
      const outcome = evaluate(symbols, { topStake });

      let payout = coinsFor(outcome, stake);
      let jackpot = false;
      if (outcome.kind === "JACKPOT") {
        payout = await claimFortuneJackpot(tx, { userId, now });
        jackpot = true;
      }

      let paid = null;
      if (payout > 0n) {
        paid = await recordLedger(tx, {
          userId,
          type: "FORTUNE_PRIZE",
          coinsDelta: payout,
          note: jackpot
            ? "Fortune Engine, the pool"
            : `Fortune Engine, ${outcome.kind === "PAYS" ? outcome.line : ""}`,
        });
        await creditCoins(tx, { userId, amount: payout });
      }

      await tx.fortuneSpin.create({
        data: {
          userId,
          stake,
          symbols: symbols.join(","),
          line:
            outcome.kind === "PAYS" ? outcome.line : jackpot ? "Jackpot" : "",
          payout,
          jackpot,
          stakeTransactionId: staked.id,
          payoutTransactionId: paid?.id ?? null,
        },
      });

      // Read back rather than computed: the balance the player is shown is
      // the stored one, which is the only one that cannot drift.
      const after = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { coins: true },
      });

      if (jackpot) {
        log.info("fortune.jackpot", {
          userId,
          payout: coinsToJSON(payout),
          stake: coinsToJSON(stake),
        });
      }

      return {
        symbols,
        line: outcome.kind === "PAYS" ? outcome.line : jackpot ? "Jackpot" : "",
        stake: coinsToJSON(stake),
        payout: coinsToJSON(payout),
        jackpot,
        balance: coinsToJSON(after.coins),
      };
    },
  );
}
