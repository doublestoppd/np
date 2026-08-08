import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { applyStatDecay, clampStat } from "./pet-stats";
import { isUsable } from "@/server/modules/items/lifecycle";
import { removeItem } from "@/server/modules/items/ownership";
import { EconomyError } from "@/server/modules/commerce/errors";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { insightBand, rereadInsight } from "@/lib/pet-insight";
import { enforcePetCareRateLimit } from "./config";
import { BOND_FOR } from "./bond";

/**
 * Reading a book aloud to a companion (ADR-50).
 *
 * The book is consumed, the title goes on the pet's shelf forever, and
 * the companion's insight goes up. A title already on the shelf is worth
 * a fraction on a re-read (`rereadInsight`) — the shelf is a list of
 * titles, breadth is what teaches, and reading the same page at an animal
 * a hundred times should not be the efficient move.
 *
 * Insight is not one of the decaying needs and is never clamped to 100:
 * it is a running total that only goes up. Happiness does move, by a
 * modest amount, because being read to is a nice way to spend an evening.
 *
 * Wrapped in an idempotency key because it destroys an item — a
 * double-submit replays rather than burning a second copy.
 */

export type ReadErrorCode =
  | "PET_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "NOT_A_BOOK"
  | "NO_ITEM_IN_INVENTORY"
  | "CONCURRENT_READ";

const PUBLIC_MESSAGES: Record<ReadErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  ITEM_NOT_FOUND: "That book could not be found.",
  NOT_A_BOOK: "That isn't something you can read aloud.",
  NO_ITEM_IN_INVENTORY: "You don't have that book any more.",
  CONCURRENT_READ:
    "That happened twice at once — nothing was used. Try again.",
};

export class ReadError extends DomainError {
  constructor(public readonly readCode: ReadErrorCode) {
    super(readCode, PUBLIC_MESSAGES[readCode]);
    this.name = "ReadError";
  }
}

/** Happiness gained from an evening's reading, whatever the book. */
const HAPPINESS_FROM_READING = 4;

export type ReadToPetResult = {
  petId: string;
  petName: string;
  bookName: string;
  author: string;
  /** True the first time this title is read to this companion. */
  firstTime: boolean;
  /** Insight this reading added. */
  insightGained: number;
  /** The companion's running total afterwards. */
  insight: number;
  /** Band name afterwards, and whether this reading moved it. */
  band: string;
  bandChanged: boolean;
  happiness: number;
  /** How many distinct titles are now on the shelf. */
  titlesRead: number;
};

export async function readToPet(
  db: DbClient,
  {
    userId,
    petId,
    itemId,
    idempotencyKey,
    now = new Date(),
  }: {
    userId: string;
    petId: string;
    itemId: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<{ result: ReadToPetResult; replayed: boolean }> {
  await enforcePetCareRateLimit(db, "read-to-pet", userId, now);
  return withIdempotency<ReadToPetResult>(
    db,
    {
      userId,
      operation: "read-to-pet",
      key: idempotencyKey,
      requestHash: requestHash({ petId, itemId }),
    },
    async (tx) => {
      const owned = await tx.pet.findUnique({
        where: { id: petId },
        select: { id: true, ownerId: true },
      });
      if (!owned || owned.ownerId !== userId) {
        // A pet owned by someone else is reported identically to a missing
        // pet, so pet ids cannot be probed.
        throw new ReadError("PET_NOT_FOUND");
      }

      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { book: true },
      });
      if (!item) {
        throw new ReadError("ITEM_NOT_FOUND");
      }
      if (item.type !== "BOOK" || !item.book) {
        throw new ReadError("NOT_A_BOOK");
      }
      if (!isUsable(item.lifecycle)) {
        throw new ReadError("ITEM_NOT_FOUND");
      }

      try {
        await removeItem(tx, { userId, itemId, quantity: 1 });
      } catch (error) {
        if (
          error instanceof EconomyError &&
          error.economyCode === "INSUFFICIENT_ITEMS"
        ) {
          throw new ReadError("NO_ITEM_IN_INVENTORY");
        }
        throw error;
      }

      // The shelf is read AFTER the book is consumed and written under the
      // same transaction, so two concurrent readings of the same title
      // cannot both count as the first.
      const existing = await tx.petBookReading.findUnique({
        where: { petId_itemId: { petId: owned.id, itemId: item.id } },
      });
      const firstTime = existing === null;
      const gained = firstTime
        ? item.book.insight
        : rereadInsight(item.book.insight);

      // Stats are read after the consume and written under a guard on the
      // snapshot timestamp — the same rule feeding follows, for the same
      // reason: two concurrent care actions must both apply, and a stale
      // snapshot would silently discard one of them.
      const pet = await tx.pet.findUniqueOrThrow({ where: { id: owned.id } });
      const current = applyStatDecay(pet, pet.statsUpdatedAt, now);
      const beforeBand = insightBand(pet.insight);
      const insight = pet.insight + gained;
      const afterBand = insightBand(insight);
      const happiness = clampStat(current.happiness + HAPPINESS_FROM_READING);

      const applied = await tx.pet.updateMany({
        where: { id: pet.id, statsUpdatedAt: pet.statsUpdatedAt },
        data: {
          ...current,
          happiness,
          insight,
          statsUpdatedAt: now,
          // Bond, and only ever upward (ADR-60).
          bond: { increment: BOND_FOR.read },
        },
      });
      if (applied.count === 0) {
        // Another care action updated this pet between the read and the
        // write. Everything rolls back, so no book was consumed.
        throw new ReadError("CONCURRENT_READ");
      }

      if (existing) {
        await tx.petBookReading.update({
          where: { id: existing.id },
          data: {
            timesRead: { increment: 1 },
            insightGiven: { increment: gained },
            lastReadAt: now,
          },
        });
      } else {
        await tx.petBookReading.create({
          data: {
            petId: pet.id,
            itemId: item.id,
            firstReadAt: now,
            lastReadAt: now,
            timesRead: 1,
            insightGiven: gained,
          },
        });
      }

      await recordLedger(tx, {
        userId,
        type: "ITEM_USE",
        itemId: item.id,
        petId: pet.id,
        quantity: 1,
        note: `Read ${item.name} to ${pet.name}`,
      });

      const titlesRead = await tx.petBookReading.count({
        where: { petId: pet.id },
      });

      return {
        petId: pet.id,
        petName: pet.name,
        bookName: item.name,
        author: item.book.author,
        firstTime,
        insightGained: gained,
        insight,
        band: afterBand.name,
        bandChanged: afterBand.name !== beforeBand.name,
        happiness,
        titlesRead,
      };
    },
  );
}
