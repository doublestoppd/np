import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { isUsable } from "@/server/modules/items/lifecycle";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { applyStatDecay, clampStat } from "./pet-stats";
import { enforcePetCareRateLimit } from "./config";
import { AilmentError } from "./ailments";
import { BOND_FOR } from "./bond";

/**
 * Giving a remedy (ADR-60).
 *
 * What a remedy sells is IMPATIENCE, not health. Every ailment ends on its
 * own within a day or three; a remedy ends it now. That framing is the
 * reason this is not pay-to-win and not a manufactured need — a player who
 * never buys one is never worse off in any lasting way, only occasionally
 * looking at a companion who is a bit under the weather.
 *
 * **A remedy offered for the wrong thing is REFUSED, not consumed.** The
 * alternative — take the bottle, do nothing, say so — punishes a misread
 * label with a real loss, and the misread label is the game's fault for
 * having more than one bottle. Refusing costs the player a tap.
 */

export interface TreatPetParams {
  userId: string;
  petId: string;
  itemId: string;
  idempotencyKey: string;
  now?: Date;
  clock?: Clock;
}

export type TreatPetResult = {
  petId: string;
  petName: string;
  itemName: string;
  /** What was settled. */
  ailmentName: string;
  happiness: number;
  health: number;
};

export async function treatPet(
  db: DbClient,
  {
    userId,
    petId,
    itemId,
    idempotencyKey,
    clock = systemClock,
  }: TreatPetParams,
): Promise<{ result: TreatPetResult; replayed: boolean }> {
  const now = clock.now();
  await enforcePetCareRateLimit(db, "treat-pet", userId, now);
  return withIdempotency<TreatPetResult>(
    db,
    {
      userId,
      operation: "treat-pet",
      key: idempotencyKey,
      requestHash: requestHash({ petId, itemId }),
    },
    async (tx) => {
      const pet = await tx.pet.findUnique({ where: { id: petId } });
      if (!pet || pet.ownerId !== userId) {
        // Reported identically to a missing pet so ids cannot be probed.
        throw new AilmentError("PET_NOT_FOUND");
      }

      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { remedy: { include: { kind: true } } },
      });
      if (!item || !isUsable(item.lifecycle)) {
        throw new AilmentError("NOT_A_REMEDY");
      }
      if (item.type !== "REMEDY" || !item.remedy) {
        throw new AilmentError("NOT_A_REMEDY");
      }

      const held = await tx.inventoryEntry.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!held || held.quantity < 1) {
        throw new AilmentError("NO_ITEM_IN_INVENTORY");
      }

      const bout = await tx.petAilment.findFirst({
        where: { petId, treatedAt: null, restsAt: { gt: now } },
        include: { kind: true },
        orderBy: { startedAt: "desc" },
      });
      if (!bout) {
        throw new AilmentError("NOTHING_TO_TREAT");
      }
      // A null kind on the remedy is the broad tonic: it settles anything.
      if (item.remedy.kindId !== null && item.remedy.kindId !== bout.kindId) {
        throw new AilmentError("WRONG_REMEDY");
      }

      // Guarded so two taps cannot both settle the same bout and both
      // consume a bottle. The loser sees nothing to treat, which is true.
      const settled = await tx.petAilment.updateMany({
        where: { id: bout.id, treatedAt: null },
        data: { treatedAt: now, remedyItemId: item.id },
      });
      if (settled.count === 0) {
        throw new AilmentError("NOTHING_TO_TREAT");
      }

      const consumed = await tx.inventoryEntry.updateMany({
        where: { userId, itemId, quantity: { gte: 1 } },
        data: { quantity: { decrement: 1 } },
      });
      if (consumed.count === 0) {
        throw new AilmentError("NO_ITEM_IN_INVENTORY");
      }

      const stats = applyStatDecay(
        {
          hunger: pet.hunger,
          happiness: pet.happiness,
          energy: pet.energy,
          health: pet.health,
          coat: pet.coat,
        },
        pet.statsUpdatedAt,
        now,
      );
      const happiness = clampStat(stats.happiness + item.remedy.comfort);

      // The snapshot is written with the ailment's cap already lifted:
      // health is not raised by the remedy, it simply stops being held
      // down. Nothing here invents health that was not there.
      const advanced = await tx.pet.updateMany({
        where: { id: petId, statsUpdatedAt: pet.statsUpdatedAt },
        data: {
          hunger: stats.hunger,
          happiness,
          energy: stats.energy,
          health: stats.health,
          coat: stats.coat ?? pet.coat,
          statsUpdatedAt: now,
          bond: { increment: BOND_FOR.treat },
        },
      });
      if (advanced.count === 0) {
        // Somebody else moved the companion between the read and the
        // write. The ailment is settled and the bottle is gone either
        // way; refusing here would undo a real cure.
        log.warn("treat-pet.stats-raced", { petId });
      }

      await recordLedger(tx, {
        userId,
        type: "ITEM_USE",
        itemId,
        petId,
        quantity: 1,
        note: `Gave ${pet.name} ${item.name} for ${bout.kind.name}`,
      });

      log.info("pet.treated", {
        userId,
        petId,
        ailment: bout.kind.key,
        remedy: item.slug,
      });

      return {
        petId,
        petName: pet.name,
        itemName: item.name,
        ailmentName: bout.kind.name,
        happiness,
        health: stats.health,
      };
    },
  );
}
