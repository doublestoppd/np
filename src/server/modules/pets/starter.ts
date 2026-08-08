import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { grantItem } from "@/server/modules/items/ownership";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { STARTER_PACK } from "./starter-pack";

export type StarterErrorCode = "SPECIES_NOT_FOUND" | "ALREADY_HAS_PET";

const STARTER_MESSAGES: Record<StarterErrorCode, string> = {
  SPECIES_NOT_FOUND: "Choose one of the companions.",
  ALREADY_HAS_PET: "You already have a companion.",
};

export class StarterError extends DomainError {
  constructor(public readonly starterCode: StarterErrorCode) {
    super(starterCode, STARTER_MESSAGES[starterCode]);
    this.name = "StarterError";
  }
}

export interface ChooseStarterParams {
  userId: string;
  speciesSlug: string;
  petName: string;
}

/**
 * Creates the user's starter pet, StarterClaim, and starter pack in one
 * transaction.
 *
 * Concurrency-safe by rollback, not by ordering. `StarterClaim.petId`
 * references the pet, so the pet has to exist first; what makes duplicates
 * impossible is that the unique `userId` on StarterClaim is violated
 * inside the same transaction that created that pet, and the abort takes
 * the pet and every grant with it. Exactly one pet and one claim can ever
 * result (docs/conventions.md).
 */
export async function chooseStarter(
  db: DbClient,
  { userId, speciesSlug, petName }: ChooseStarterParams,
): Promise<{ petId: string }> {
  try {
    return await db.$transaction(async (tx) => {
      const species = await tx.petSpecies.findUnique({
        where: { slug: speciesSlug },
      });
      if (!species) {
        throw new StarterError("SPECIES_NOT_FOUND");
      }

      const pet = await tx.pet.create({
        data: { name: petName, ownerId: userId, speciesId: species.id },
      });
      // The concurrency anchor: unique userId makes duplicates impossible.
      // A loser here rolls back the pet created just above.
      await tx.starterClaim.create({ data: { userId, petId: pet.id } });

      for (const grant of STARTER_PACK) {
        const item = await tx.item.findUnique({ where: { slug: grant.slug } });
        if (!item) {
          // Seed data is missing; abort so the player is not shortchanged.
          throw new Error(`Starter pack item not seeded: ${grant.slug}`);
        }
        const ledger = await recordLedger(tx, {
          userId,
          type: "STARTER_GRANT",
          itemId: item.id,
          petId: pet.id,
          quantity: grant.quantity,
          // Names the thing. The note used to repeat the row's own type
          // label, so /history and the profile's recent activity both
          // showed three rows reading "Starter pack — Starter pack" with
          // identical timestamps, which reads as a bug rather than as
          // three gifts. The Hollow's opening grant already did this
          // properly one module over; this is that, for the satchel.
          note:
            grant.quantity > 1
              ? `${item.name} ×${grant.quantity}, to start you off`
              : `${item.name}, to start you off`,
        });
        await grantItem(tx, {
          userId,
          item,
          quantity: grant.quantity,
          reason: "distribution",
          source: "starter-pack",
          transactionId: ledger.id,
        });
      }

      return { petId: pet.id };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new StarterError("ALREADY_HAS_PET");
    }
    throw error;
  }
}
