import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { DomainError } from "@/server/errors";
import { isUsable } from "@/server/modules/items/lifecycle";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { applyStatDecay, clampStat, STAT_MAX } from "./pet-stats";
import { enforcePetCareRateLimit } from "./config";
import { GROOM_COOLDOWN_MINUTES, GROOM_HAPPINESS } from "./play-config";
import { BOND_FOR } from "./bond";

/**
 * Brushing (ADR-60).
 *
 * The third care verb, and it is built on the toy's economics rather than
 * the food's, deliberately: **a brush is kept, never used up.** The
 * limiter is a per-(companion, tool) cooldown, so the answer to a coat
 * that needs doing is owning two or three different tools rather than
 * buying a consumable every week. A player who buys a brush and a comb in
 * their first fortnight has finished shopping for grooming permanently.
 *
 * That matters more here than it did for toys, because the coat is also
 * the one need that feeds into whether a companion picks something up. If
 * keeping a coat cost money per session, an ailment would be a bill —
 * which is precisely the manufactured need CLAUDE.md's no-pay-to-win rule
 * exists to rule out.
 */

export type GroomErrorCode =
  | "PET_NOT_FOUND"
  | "NOT_A_TOOL"
  | "NO_ITEM_IN_INVENTORY"
  | "TOOL_RESTING"
  | "COAT_IMMACULATE"
  | "CONCURRENT_GROOM";

const PUBLIC_MESSAGES: Record<GroomErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  NOT_A_TOOL: "That isn't something to groom with.",
  NO_ITEM_IN_INVENTORY: "You don't have that.",
  TOOL_RESTING:
    "You've just been over them with that one. Something different, or come back later — nothing is used up either way.",
  COAT_IMMACULATE:
    "There is genuinely nothing left to do. Nothing was used — the brush keeps.",
  CONCURRENT_GROOM: "That happened twice at once — nothing changed. Try again.",
};

export class GroomError extends DomainError {
  constructor(public readonly groomCode: GroomErrorCode) {
    super(groomCode, PUBLIC_MESSAGES[groomCode]);
    this.name = "GroomError";
  }
}

export interface GroomPetParams {
  userId: string;
  petId: string;
  itemId: string;
  idempotencyKey: string;
  clock?: Clock;
}

export type GroomPetResult = {
  petId: string;
  petName: string;
  itemName: string;
  coat: number;
  happiness: number;
  /** True when this session took the coat all the way up. */
  immaculate: boolean;
};

export async function groomPet(
  db: DbClient,
  { userId, petId, itemId, idempotencyKey, clock = systemClock }: GroomPetParams,
): Promise<{ result: GroomPetResult; replayed: boolean }> {
  const now = clock.now();
  await enforcePetCareRateLimit(db, "groom-pet", userId, now);
  return withIdempotency<GroomPetResult>(
    db,
    {
      userId,
      operation: "groom-pet",
      key: idempotencyKey,
      requestHash: requestHash({ petId, itemId }),
    },
    async (tx) => {
      const pet = await tx.pet.findUnique({ where: { id: petId } });
      if (!pet || pet.ownerId !== userId) {
        throw new GroomError("PET_NOT_FOUND");
      }

      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item || !isUsable(item.lifecycle)) {
        throw new GroomError("NOT_A_TOOL");
      }
      if (item.type !== "GROOMING_TOOL" || (item.coatCare ?? 0) <= 0) {
        throw new GroomError("NOT_A_TOOL");
      }

      // Owned, but NOT consumed. The check is that they have one at all.
      const held = await tx.inventoryEntry.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!held || held.quantity < 1) {
        throw new GroomError("NO_ITEM_IN_INVENTORY");
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
      const coatNow = stats.coat ?? pet.coat;
      if (coatNow >= STAT_MAX) {
        // Refused rather than absorbed, the same way an overfull companion
        // refuses a meal: a tap that visibly does nothing reads as a bug.
        throw new GroomError("COAT_IMMACULATE");
      }

      const readyAt = new Date(now.getTime() - GROOM_COOLDOWN_MINUTES * 60_000);
      const lastUse = await tx.petGroomUse.findUnique({
        where: { petId_itemId: { petId, itemId } },
      });
      if (lastUse && lastUse.lastUsedAt > readyAt) {
        throw new GroomError("TOOL_RESTING");
      }

      const coat = clampStat(coatNow + (item.coatCare ?? 0));
      const happiness = clampStat(stats.happiness + GROOM_HAPPINESS);

      const advanced = await tx.pet.updateMany({
        where: { id: petId, statsUpdatedAt: pet.statsUpdatedAt },
        data: {
          hunger: stats.hunger,
          happiness,
          energy: stats.energy,
          health: stats.health,
          coat,
          statsUpdatedAt: now,
          bond: { increment: BOND_FOR.groom },
        },
      });
      if (advanced.count === 0) {
        // Two care actions raced. Neither has consumed anything here — a
        // brush is kept — so refusing costs the player only a tap.
        throw new GroomError("CONCURRENT_GROOM");
      }

      await tx.petGroomUse.upsert({
        where: { petId_itemId: { petId, itemId } },
        create: { petId, itemId, lastUsedAt: now },
        update: { lastUsedAt: now },
      });

      log.info("pet.groomed", { userId, petId, item: item.slug, coat });

      return {
        petId,
        petName: pet.name,
        itemName: item.name,
        coat,
        happiness,
        immaculate: coat >= STAT_MAX,
      };
    },
  );
}
