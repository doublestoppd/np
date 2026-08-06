import type { PrismaClient } from "@prisma/client";

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
 * Creates the user's first pet and grants the starter item pack atomically.
 * Users who already own a pet cannot claim a second starter.
 */
export async function chooseStarter(
  db: PrismaClient,
  { userId, speciesSlug, petName }: ChooseStarterParams,
): Promise<{ petId: string }> {
  return db.$transaction(async (tx) => {
    const existing = await tx.pet.count({ where: { ownerId: userId } });
    if (existing > 0) {
      throw new StarterError("ALREADY_HAS_PET");
    }

    const species = await tx.petSpecies.findUnique({
      where: { slug: speciesSlug },
    });
    if (!species) {
      throw new StarterError("SPECIES_NOT_FOUND");
    }

    const pet = await tx.pet.create({
      data: { name: petName, ownerId: userId, speciesId: species.id },
    });

    for (const grant of STARTER_PACK) {
      const item = await tx.item.findUnique({ where: { slug: grant.slug } });
      if (!item) {
        // Seed data is missing; abort so the player is not shortchanged.
        throw new Error(`Starter pack item not seeded: ${grant.slug}`);
      }
      await tx.inventoryEntry.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        create: { userId, itemId: item.id, quantity: grant.quantity },
        update: { quantity: { increment: grant.quantity } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: "STARTER_GRANT",
          itemId: item.id,
          petId: pet.id,
          quantity: grant.quantity,
          note: "Starter pack",
        },
      });
    }

    return { petId: pet.id };
  });
}
