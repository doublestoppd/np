import type { PrismaClient } from "@prisma/client";

export async function ensureTestSpecies(db: PrismaClient, slug: string) {
  return db.petSpecies.upsert({
    where: { slug },
    create: {
      slug,
      name: "Fixture Species",
      description: "Test only",
      artKey: "test",
    },
    update: {},
  });
}

export async function createTestPet(
  db: PrismaClient,
  {
    ownerId,
    speciesId,
    name = "Testling",
  }: { ownerId: string; speciesId: string; name?: string },
) {
  return db.pet.create({ data: { name, ownerId, speciesId } });
}
