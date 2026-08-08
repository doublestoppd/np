import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { applyStatDecay, clampStat, STAT_MAX } from "./pet-stats";
import { isUsable } from "@/server/modules/items/lifecycle";
import { removeItem } from "@/server/modules/items/ownership";
import { EconomyError } from "@/server/modules/commerce/errors";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { enforcePetCareRateLimit } from "./config";
import { foodHappinessBonus, isDelight, palateFor, reactionFor, type PetReaction } from "./palate";
import { rememberDelight } from "./fondness";
import { BOND_FOR } from "./bond";
import { requestHash, withIdempotency } from "@/server/security/idempotency";

export type FeedErrorCode =
  | "PET_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "NOT_FOOD"
  | "NO_ITEM_IN_INVENTORY"
  | "PET_FULL"
  | "CONCURRENT_FEED";

const PUBLIC_MESSAGES: Record<FeedErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  ITEM_NOT_FOUND: "That item could not be found.",
  NOT_FOOD: "That isn't something your companion can eat.",
  NO_ITEM_IN_INVENTORY: "You don't have any of those left.",
  // Says which meal, not "full": a companion at four of five segments
  // reads as "Well fed", and being told it is full while a light snack is
  // still accepted taught the first player who hit it the wrong rule.
  PET_FULL:
    "That's more than your companion has room for — something lighter would go down. Nothing was used.",
  CONCURRENT_FEED:
    "That happened twice at once — nothing was used. Try again.",
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
  petName: string;
  itemName: string;
  /** What this companion made of it. Never says why (see ./palate.ts). */
  reaction: PetReaction;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
};

/**
 * Feeds one unit of a food item to a pet the user owns. Runs atomically:
 * ownership check, food-type check, guarded inventory decrement through the
 * ownership boundary, stat decay up to `now`, hunger restore, and a ledger
 * entry either all commit or all roll back. A meal that would take hunger
 * past the maximum is refused (`PET_FULL`) instead of being clamped, so a
 * full companion never eats an item for nothing. Wrapped in an idempotency key
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
      const owned = await tx.pet.findUnique({
        where: { id: petId },
        select: { id: true, ownerId: true },
      });
      if (!owned || owned.ownerId !== userId) {
        // A pet owned by someone else is reported identically to a missing
        // pet so pet ids cannot be probed.
        throw new FeedError("PET_NOT_FOUND");
      }

      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { tags: { select: { slug: true } } },
      });
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

      // Read the pet's stats only AFTER the item is consumed, and write
      // them back under a guard on the snapshot timestamp. Two concurrent
      // feedings both legitimately consume an item, so both stat updates
      // must apply: reading beforehand would let the second overwrite the
      // first from a stale snapshot, silently discarding one feeding.
      const pet = await tx.pet.findUniqueOrThrow({ where: { id: owned.id } });
      const current = applyStatDecay(pet, pet.statsUpdatedAt, now);
      const nextHunger = current.hunger + (item.hungerRestore ?? 0);

      // What this companion makes of the meal. The bonus is flat rather
      // than proportional to hungerRestore, so knowing what your companion
      // likes never collapses the food catalogue into "the most filling
      // thing carrying the right tag" (./palate.ts).
      const reaction = reactionFor(
        palateFor(pet.palateSeed),
        pet.palateSeed,
        {
          slug: item.slug,
          tagSlugs: item.tags.map((tag) => tag.slug),
          kind: "FOOD",
        },
      );

      // A meal the companion cannot finish is refused outright rather than
      // clamped. Clamping silently destroyed the surplus: feeding a nearly
      // full pet a large meal consumed the whole item for a few points of
      // hunger, which is exactly the kind of quiet waste a player only
      // discovers by losing something. The check sits after `removeItem`
      // because the guarded write below needs a snapshot read inside the
      // transaction — throwing here rolls the removal back with everything
      // else, so nothing is consumed.
      if (nextHunger > STAT_MAX) {
        throw new FeedError("PET_FULL");
      }
      const nextStats = {
        ...current,
        hunger: nextHunger,
        happiness: clampStat(current.happiness + foodHappinessBonus(reaction)),
      };

      const applied = await tx.pet.updateMany({
        where: { id: pet.id, statsUpdatedAt: pet.statsUpdatedAt },
        data: {
          ...nextStats,
          statsUpdatedAt: now,
          // Bond, and only ever upward (ADR-60).
          bond: { increment: BOND_FOR.feed },
        },
      });
      if (applied.count === 0) {
        // Another feeding updated this pet between the read and the write.
        // The whole transaction rolls back, so no item was consumed.
        throw new FeedError("CONCURRENT_FEED");
      }

      if (isDelight(reaction)) {
        await rememberDelight(tx, { petId: pet.id, itemId: item.id, now });
      }

      await recordLedger(tx, {
        userId,
        type: "ITEM_USE",
        itemId: item.id,
        petId: pet.id,
        quantity: 1,
        note: `Fed ${item.name} to ${pet.name}`,
      });

      return {
        petId: pet.id,
        petName: pet.name,
        itemName: item.name,
        reaction,
        ...nextStats,
      };
    },
  );
}
