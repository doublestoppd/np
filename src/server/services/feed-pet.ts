import type { PrismaClient } from "@prisma/client";
import { applyStatDecay, clampStat } from "./pet-stats";

export type FeedErrorCode =
  | "PET_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "NOT_FOOD"
  | "NO_ITEM_IN_INVENTORY";

export class FeedError extends Error {
  constructor(public readonly code: FeedErrorCode) {
    super(code);
    this.name = "FeedError";
  }
}

export interface FeedPetParams {
  userId: string;
  petId: string;
  itemId: string;
  now?: Date;
}

export interface FeedPetResult {
  petId: string;
  itemName: string;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
}

/**
 * Feeds one unit of a food item to a pet the user owns. Runs atomically:
 * ownership check, food-type check, guarded inventory decrement, stat decay
 * up to `now`, hunger restore, and a ledger entry either all commit or all
 * roll back. The inventory decrement uses a quantity >= 1 guard so concurrent
 * requests cannot spend the same unit twice.
 */
export async function feedPet(
  db: PrismaClient,
  { userId, petId, itemId, now = new Date() }: FeedPetParams,
): Promise<FeedPetResult> {
  return db.$transaction(async (tx) => {
    const pet = await tx.pet.findUnique({ where: { id: petId } });
    if (!pet || pet.ownerId !== userId) {
      // A pet owned by someone else is reported identically to a missing pet
      // so pet ids cannot be probed.
      throw new FeedError("PET_NOT_FOUND");
    }

    const item = await tx.item.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new FeedError("ITEM_NOT_FOUND");
    }
    if (item.type !== "FOOD") {
      throw new FeedError("NOT_FOOD");
    }

    const decremented = await tx.inventoryEntry.updateMany({
      where: { userId, itemId, quantity: { gte: 1 } },
      data: { quantity: { decrement: 1 } },
    });
    if (decremented.count === 0) {
      throw new FeedError("NO_ITEM_IN_INVENTORY");
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

    await tx.transaction.create({
      data: {
        userId,
        type: "ITEM_USE",
        itemId: item.id,
        petId: pet.id,
        quantity: 1,
        note: `Fed ${item.name} to ${pet.name}`,
      },
    });

    return { petId: pet.id, itemName: item.name, ...nextStats };
  });
}
