import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { grantItem } from "@/server/modules/items/ownership";
import { recordLedger } from "@/server/modules/commerce/ledger";

export type StarterErrorCode = "SPECIES_NOT_FOUND" | "ALREADY_HAS_PET";

export class StarterError extends Error {
  constructor(public readonly code: StarterErrorCode) {
    super(code);
    this.name = "StarterError";
  }
}

/** Item slugs (and quantities) granted alongside a starter pet. */
const STARTER_PACK: ReadonlyArray<{ slug: string; quantity: number }> = [
  { slug: "sunberry-cluster", quantity: 3 },
  { slug: "honey-oat-loaf", quantity: 2 },
  { slug: "bounce-burr", quantity: 1 },
];

export interface ChooseStarterParams {
  userId: string;
  speciesSlug: string;
  petName: string;
}

/**
 * Creates the user's starter pet, StarterClaim, and starter pack in one
 * transaction. Concurrency-safe by construction: the unique StarterClaim
 * per user is created FIRST, so a concurrent duplicate request aborts on
 * the unique constraint before any pet or grant exists — exactly one pet
 * and one claim can ever result (docs/conventions.md).
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
          note: "Starter pack",
        });
        await grantItem(tx, {
          userId,
          item,
          quantity: grant.quantity,
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
