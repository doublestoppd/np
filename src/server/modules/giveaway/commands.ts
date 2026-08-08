import { Prisma } from "@prisma/client";
import type { DbClient, DbTx } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { assertPlayerTradeAccess } from "@/server/modules/commerce/policies";
import { grantItem, removeItem } from "@/server/modules/items/ownership";
import { isSellable } from "@/server/modules/items/lifecycle";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { GiveawayError } from "./errors";
import {
  DONATIONS_PER_DAY,
  GIVEAWAY_MAX_QUANTITY,
  OFFERING_LIFETIME_MS,
  SHELF_CAPACITY,
  TAKES_PER_DAY,
  enforceGiveawayRateLimit,
} from "./config";

/**
 * The Leaving Shelf's two commands.
 *
 * Both sides go through `assertPlayerTradeAccess`, because both sides are
 * player-to-player transfer — the shelf is free, instant and untaxed, so
 * without the same 24-hour gate the market carries it would be a strictly
 * better mule channel than the market (docs/architecture-decisions.md
 * ADR-43).
 *
 * Nothing here mints or destroys coins. The shelf moves goods and only
 * goods, so it can never become a faucet no matter how it is abused.
 */

/** The whole shelf is one contended resource, so it takes one lock. */
async function lockShelf(tx: DbTx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"giveaway-shelf"}))`;
}

export interface LeaveResult {
  [key: string]: string | number;
  offeringId: string;
  itemSlug: string;
  itemName: string;
  quantity: number;
  gameDate: GameDate;
  /** Donations left today, after this one. */
  remainingToday: number;
}

export interface TakeResult {
  [key: string]: string | number;
  offeringId: string;
  itemSlug: string;
  itemName: string;
  itemArtKey: string;
  donorUsername: string;
  gameDate: GameDate;
  /** Takes left today, after this one. */
  remainingToday: number;
}

/**
 * Puts a handful of spares on the shelf.
 *
 * The copies leave the satchel here and now, and nothing ever puts them
 * back: there is no cancel, no reclaim, and no return at expiry. That is
 * deliberate and the interface says so before the tap — a gift you can
 * take back is a listing, and a shelf whose lots can be pulled is a
 * display case for bait.
 *
 * Stackable and tradeable only. Instanced goods carry provenance and a
 * single identity, and threading escrow-and-transfer through a shelf that
 * mostly expires would put that identity at risk for no gain; furnishings
 * fall out for free, since none of them is tradeable.
 */
export async function leaveOnShelf(
  db: DbClient,
  {
    userId,
    itemId,
    quantity,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    itemId: string;
    quantity: number;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: LeaveResult; replayed: boolean }> {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > GIVEAWAY_MAX_QUANTITY
  ) {
    throw new GiveawayError("NOT_DONATABLE");
  }
  await enforceGiveawayRateLimit(db, "giveaway-leave", userId, clock.now());
  await assertPlayerTradeAccess(db, userId, { now: clock.now() });

  const gameDate = currentGameDate(clock);

  return withIdempotency<LeaveResult>(
    db,
    {
      userId,
      operation: "giveaway-leave",
      key: idempotencyKey,
      requestHash: requestHash({ itemId, quantity, gameDate }),
    },
    async (tx) => {
      const now = clock.now();
      await lockShelf(tx);

      const item = await tx.item.findUnique({ where: { id: itemId } });
      // One rule for what may be given, and it is the market's rule: if
      // you could sell it to another player you may leave it here. Two
      // different answers to "can this move between players" is how a
      // thing ends up tradeable through one door and not the other.
      if (!item || !item.stackable || !item.tradeable || !isSellable(item.lifecycle)) {
        throw new GiveawayError("NOT_DONATABLE");
      }

      const liveShelf = await tx.giveawayOffering.count({
        where: { expiresAt: { gt: now }, remaining: { gt: 0 } },
      });
      if (liveShelf >= SHELF_CAPACITY) {
        throw new GiveawayError("SHELF_FULL");
      }

      const givenToday = await tx.giveawayOffering.count({
        where: { donorId: userId, gameDate },
      });
      if (givenToday >= DONATIONS_PER_DAY) {
        throw new GiveawayError("GAVE_ENOUGH_TODAY");
      }
      const donationOrdinal = givenToday + 1;

      // The guarded decrement is the ownership check: there is no earlier
      // read of the satchel to go stale between looking and taking. It
      // raises INSUFFICIENT_ITEMS itself, which already says the right
      // thing, so nothing here catches and relabels it.
      await removeItem(tx, { userId, itemId, quantity });

      const ledger = await recordLedger(tx, {
        userId,
        type: "GIVEAWAY_LEAVE",
        itemId: item.id,
        quantity,
        note: `Left ${quantity} × ${item.name} on the Leaving Shelf`,
        metadata: { gameDate },
      });

      let offering;
      try {
        offering = await tx.giveawayOffering.create({
          data: {
            donorId: userId,
            itemId: item.id,
            quantity,
            remaining: quantity,
            gameDate,
            donationOrdinal,
            offeredAt: now,
            expiresAt: new Date(now.getTime() + OFFERING_LIFETIME_MS),
            transactionId: ledger.id,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // Another donation took this ordinal. The whole transaction
          // rolls back, so the satchel is untouched.
          throw new GiveawayError("GAVE_ENOUGH_TODAY");
        }
        throw error;
      }

      log.info("giveaway.left", {
        userId,
        item: item.slug,
        quantity,
        gameDate,
      });

      return {
        offeringId: offering.id,
        itemSlug: item.slug,
        itemName: item.name,
        quantity,
        gameDate,
        remainingToday: Math.max(0, DONATIONS_PER_DAY - donationOrdinal),
      };
    },
  );
}

/**
 * Takes one copy off a lot.
 *
 * One copy, always: the quantity is a constant here and not a parameter,
 * so there is no number for a client to inflate and no bulk path for one
 * account to drain another's lot in a single tap. The `(offeringId,
 * takerId)` constraint enforces the rest — a second attempt at the same
 * lot is refused by the database, not by a count.
 *
 * Expiry is re-evaluated inside the transaction against the same clock
 * that wrote it. The shelf query already filters on it, but a lot can go
 * cold in the seconds between the page rendering and the thumb landing,
 * and the shelf's whole promise is that an expired lot is gone.
 *
 * The donor's standing is deliberately not checked. A player-shop listing
 * is withdrawn when its seller is suspended or leaves, because completing
 * that sale would pay them; nothing is paid here, and the goods stopped
 * being theirs when they set them down. Voiding the lot would destroy
 * somebody's gift to punish the giver, which helps nobody.
 */
export async function takeFromShelf(
  db: DbClient,
  {
    userId,
    offeringId,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    offeringId: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: TakeResult; replayed: boolean }> {
  await enforceGiveawayRateLimit(db, "giveaway-take", userId, clock.now());
  await assertPlayerTradeAccess(db, userId, { now: clock.now() });

  const gameDate = currentGameDate(clock);

  return withIdempotency<TakeResult>(
    db,
    {
      userId,
      operation: "giveaway-take",
      key: idempotencyKey,
      requestHash: requestHash({ offeringId, gameDate }),
    },
    async (tx) => {
      const now = clock.now();

      const tookToday = await tx.giveawayTake.count({
        where: { takerId: userId, gameDate },
      });
      if (tookToday >= TAKES_PER_DAY) {
        throw new GiveawayError("TOOK_ENOUGH_TODAY");
      }
      const takeOrdinal = tookToday + 1;

      // The claim and the check are the same statement. Every condition a
      // take depends on — still unexpired, still something left, still an
      // item that may move between players — is in the `where`, so two
      // thumbs on the last copy of a lot cannot both pass a read and then
      // both write.
      //
      // The item clause is not decoration. Without it a lot whose item had
      // been pulled from circulation stayed reachable by id after the
      // shelf stopped showing it, which is the precise shape of the kill
      // switch defect the Hollow shipped once already: the read and the
      // write have to agree, and they agree by using the same rule.
      const claimed = await tx.giveawayOffering.updateMany({
        where: {
          id: offeringId,
          remaining: { gt: 0 },
          expiresAt: { gt: now },
          donorId: { not: userId },
          item: { lifecycle: { in: ["ACTIVE", "RETIRED"] }, tradeable: true },
        },
        data: { remaining: { decrement: 1 } },
      });
      if (claimed.count === 0) {
        // Say which of the three it was, but only after failing safely:
        // this read cannot widen anything, because nothing was claimed.
        const offering = await tx.giveawayOffering.findUnique({
          where: { id: offeringId },
          select: { donorId: true },
        });
        throw new GiveawayError(
          offering?.donorId === userId ? "YOUR_OWN" : "GONE",
        );
      }

      const offering = await tx.giveawayOffering.findUniqueOrThrow({
        where: { id: offeringId },
        include: { item: true, donor: { select: { username: true } } },
      });

      const ledger = await recordLedger(tx, {
        userId,
        type: "GIVEAWAY_TAKE",
        counterpartyUserId: offering.donorId,
        itemId: offering.itemId,
        quantity: 1,
        note: `Took ${offering.item.name} from the Leaving Shelf`,
        metadata: { gameDate },
      });

      try {
        await tx.giveawayTake.create({
          data: {
            offeringId: offering.id,
            takerId: userId,
            itemId: offering.itemId,
            gameDate,
            takeOrdinal,
            takenAt: now,
            transactionId: ledger.id,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          // Either a second attempt at this lot, or another take of the
          // day landing on this ordinal first. Both roll the whole
          // transaction back, including the decrement above, so the copy
          // stays on the shelf for somebody.
          //
          // The root client, not `tx`: Postgres has already aborted this
          // transaction, so any further statement on it fails with
          // "current transaction is aborted" and buries the real cause.
          const already = await db.giveawayTake.count({
            where: { offeringId: offering.id, takerId: userId },
          });
          throw new GiveawayError(
            already > 0 ? "ALREADY_TOOK_ONE" : "CONCURRENT_TAKE",
          );
        }
        throw error;
      }

      await grantItem(tx, {
        userId,
        item: offering.item,
        quantity: 1,
        // Transfer, not distribution: this copy already exists and has
        // already left somebody's satchel. Minting rules do not apply, and
        // a retired item must still reach the person who took it.
        reason: "transfer",
        source: "giveaway:leaving-shelf",
        transactionId: ledger.id,
        now,
      });

      log.info("giveaway.taken", {
        userId,
        donorId: offering.donorId,
        item: offering.item.slug,
        gameDate,
      });

      return {
        offeringId: offering.id,
        itemSlug: offering.item.slug,
        itemName: offering.item.name,
        itemArtKey: offering.item.artKey,
        donorUsername: offering.donor.username,
        gameDate,
        remainingToday: Math.max(0, TAKES_PER_DAY - takeOrdinal),
      };
    },
  );
}
