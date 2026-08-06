import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/** Species: UPSERT_ONLY — omission never deletes (pets reference them). */
export async function seedSpecies(
  prisma: PrismaClient,
  species: GameContent["species"],
  report: SeedReport,
): Promise<void> {
  for (const entry of species) {
    const existing = await prisma.petSpecies.findUnique({
      where: { slug: entry.slug },
    });
    if (!existing) {
      await prisma.petSpecies.create({ data: entry });
      report.record("Species", "created");
    } else if (sameFields(existing, entry)) {
      report.record("Species", "unchanged");
    } else {
      await prisma.petSpecies.update({ where: { slug: entry.slug }, data: entry });
      report.record("Species", "updated");
    }
  }
}
