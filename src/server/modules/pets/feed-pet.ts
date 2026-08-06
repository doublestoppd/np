import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { applyStatDecay, clampStat } from "./pet-stats";
import { isUsable } from "@/server/modules/items/lifecycle";
import { removeItem } from "@/server/modules/items/ownership";
import { EconomyError } from "@/server/modules/commerce/errors";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { enforcePetCareRateLimit } from "./config";
import { requestHash, withIdempotency } from "@/server/security/idempotency";

export type FeedErrorCode =
  | "PET_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "NOT_FOOD"
  | "NO_ITEM_IN_INVENTORY";

const PUBLIC_MESSAGES: Record<FeedErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  ITEM_NOT_FOUND: "That item could not be found.",
  NOT_FOOD: "That isn't something your companion can eat.",
  NO_ITEM_IN_INVENTORY: "You don't have any of those left.",
};

export class FeedError extends DomainError {
  constructor(public readonly feedCode: FeedErrorCode) {
    super(feedCode, PUBLIC_MESSAGES[feedCode]);
    this.name = "FeedError";
  }
}

export interface FeedPetParams {
  userId: string;
  petId: string;
  itemId: string;
  /** Required: feeding consumes an item, so double-submits must replay. */
  idempotencyKey: string;
  now?: Date;
}

/**
 * JSON-safe result (stored as the idempotency replay payload), so a
 * duplicate submission returns the original outcome rather than eating a
 * second item.
 */
export type FeedPetResult = {
  petId: string;
  itemName: string;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
};

/**
 * Feeds one unit of a food item to a pet the user owns. Runs atomically:
 * ownership check, food-type check, guarded inventory decrement through the
 * ownership boundary, stat decay up to `now`, hunger restore, and a ledger
 * entry either all commit or all roll back. Wrapped in an idempotency key
 * because it consumes an item — a double-submit replays instead of
 * destroying a second unit (docs/conventions.md — economy invariants).
 */
export async function feedPet(
  db: DbClient,
  { userId, petId, itemId, idempotencyKey, now = new Date() }: FeedPetParams,
): Promise<{ result: FeedPetResult; replayed: boolean }> {
  await enforcePetCareRateLimit(db, "feed-pet", userId, now);
  return withIdempotency<FeedPetResult>(
    db,
    {
      userId,
      operation: "feed-pet",
      key: idempotencyKey,
      requestHash: requestHash({ petId, itemId }),
    },
    async (tx) => {
      const pet = await tx.pet.findUnique({ where: { id: petId } });
      if (!pet || pet.ownerId !== userId) {
        // A pet owned by someone else is reported identically to a missing
        // pet so pet ids cannot be probed.
        throw new FeedError("PET_NOT_FOUND");
      }

      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) {
        throw new FeedError("ITEM_NOT_FOUND");
      }
      if (item.type !== "FOOD") {
        throw new FeedError("NOT_FOOD");
      }
      if (!isUsable(item.lifecycle)) {
        throw new FeedError("ITEM_NOT_FOUND");
      }

      try {
        await removeItem(tx, { userId, itemId, quantity: 1 });
      } catch (error) {
        if (
          error instanceof EconomyError &&
          error.economyCode === "INSUFFICIENT_ITEMS"
        ) {
          throw new FeedError("NO_ITEM_IN_INVENTORY");
        }
        throw error;
      }

      const current = applyStatDecay(pet, pet.statsUpdatedAt, now);
      const nextStats = {
        ...current,
        hunger: clampStat(current.hunger + (item.hungerRestore ?? 0)),
      };

      await tx.pet.update({
        where: { id: pet.id },
        data: { ...nextStats, statsUpdatedAt: now },
      });

      await recordLedger(tx, {
        userId,
        type: "ITEM_USE",
        itemId: item.id,
        petId: pet.id,
        quantity: 1,
        note: `Fed ${item.name} to ${pet.name}`,
      });

      return { petId: pet.id, itemName: item.name, ...nextStats };
    },
  );
}
