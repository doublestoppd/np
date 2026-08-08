import { randomInt } from "node:crypto";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { DomainError } from "@/server/errors";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { applyStatDecay, clampStat } from "./pet-stats";
import { enforcePetCareRateLimit } from "./config";
import { SIT_COOLDOWN_MINUTES, SIT_HAPPINESS } from "./play-config";
import { BOND_FOR } from "./bond";
import { currentAilment } from "./ailments";
import { describeSitting } from "./company";

/**
 * Sitting with them (ADR-61).
 *
 * **The one thing you can always do.** Every other care verb in the game
 * needs something out of the satchel: a meal, a toy, a book, a brush, a
 * bottle. That meant a player with nothing in the satchel and nothing in
 * the purse — a brand-new account on day two, or anybody at the wrong end
 * of a bad week — could open the game, look at their companion, and have
 * literally no way to do anything for them. For a game whose whole premise
 * is looking after something, that was the wrong hole to have.
 *
 * So this costs nothing and always will. No item, no coins, no unlock, no
 * streak. The limiter is time, and time is the only thing it can be: a
 * price would put the one unconditional act of care behind the economy,
 * which is the exact shape CLAUDE.md's no-pay-to-win rule exists to keep
 * out of the middle of the game.
 *
 * What it gives back is small on purpose (see SIT_HAPPINESS) and the bond,
 * which is worth more here than a meal is. The line is the real reward,
 * and it is chosen from what is actually going on with this companion
 * right now — see ./company.ts.
 */

export type SitErrorCode = "PET_NOT_FOUND" | "TOO_SOON" | "CONCURRENT_SIT";

const PUBLIC_MESSAGES: Record<SitErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  // Never a scold, and never a countdown to the minute: "you have 47
  // minutes left" turns sitting down with something you love into a timer.
  TOO_SOON:
    "You have only just been sitting with them. They are still there, and so are you — try again in a while.",
  CONCURRENT_SIT: "That happened twice at once — nothing changed. Try again.",
};

export class SitError extends DomainError {
  constructor(public readonly sitCode: SitErrorCode) {
    super(sitCode, PUBLIC_MESSAGES[sitCode]);
    this.name = "SitError";
  }
}

export interface SitWithPetParams {
  userId: string;
  petId: string;
  idempotencyKey: string;
  clock?: Clock;
}

export type SitWithPetResult = {
  petId: string;
  petName: string;
  /** What happened, in one sentence. */
  line: string;
  happiness: number;
  /** When sitting down will mean something again, as an ISO string. */
  readyAt: string;
};

export async function sitWithPet(
  db: DbClient,
  { userId, petId, idempotencyKey, clock = systemClock }: SitWithPetParams,
): Promise<{ result: SitWithPetResult; replayed: boolean }> {
  const now = clock.now();
  await enforcePetCareRateLimit(db, "sit-with-pet", userId, now);
  return withIdempotency<SitWithPetResult>(
    db,
    {
      userId,
      operation: "sit-with-pet",
      key: idempotencyKey,
      requestHash: requestHash({ petId }),
    },
    async (tx) => {
      const pet = await tx.pet.findUnique({ where: { id: petId } });
      if (!pet || pet.ownerId !== userId) {
        throw new SitError("PET_NOT_FOUND");
      }

      // Every state-dependent check lives inside the idempotent body, so a
      // genuine replay returns the stored result rather than being told it
      // is too soon (the ordering bug ADR-59 records).
      const readyAt = new Date(
        pet.lastSatWithAt
          ? pet.lastSatWithAt.getTime() + SIT_COOLDOWN_MINUTES * 60_000
          : 0,
      );
      if (readyAt > now) {
        throw new SitError("TOO_SOON");
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
      const happiness = clampStat(stats.happiness + SIT_HAPPINESS);

      // Read before the write, so the line describes the companion you sat
      // down with rather than the one you are leaving.
      const ailment = await currentAilment(tx, { petId, clock });
      const line = describeSitting(
        {
          hunger: stats.hunger,
          happiness: stats.happiness,
          energy: stats.energy,
          health: stats.health,
          coat: stats.coat ?? pet.coat,
          bond: pet.bond,
          unwell: ailment !== null,
        },
        randomInt(0, 1_000),
      );

      const advanced = await tx.pet.updateMany({
        where: { id: petId, statsUpdatedAt: pet.statsUpdatedAt },
        data: {
          hunger: stats.hunger,
          happiness,
          energy: stats.energy,
          health: stats.health,
          ...(stats.coat === undefined ? {} : { coat: stats.coat }),
          statsUpdatedAt: now,
          lastSatWithAt: now,
          bond: { increment: BOND_FOR.sit },
        },
      });
      if (advanced.count === 0) {
        // Two care actions raced. Nothing was consumed here — there is
        // nothing to consume — so refusing costs the player only a tap.
        throw new SitError("CONCURRENT_SIT");
      }

      log.info("pet.sat-with", { userId, petId });

      return {
        petId,
        petName: pet.name,
        line,
        happiness,
        readyAt: new Date(
          now.getTime() + SIT_COOLDOWN_MINUTES * 60_000,
        ).toISOString(),
      };
    },
  );
}
