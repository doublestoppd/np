/**
 * Seed orchestrator: validates all content offline, then synchronizes it
 * into the database domain by domain and prints a per-domain change
 * report. Content lives in prisma/content/ (see prisma/content/README.md);
 * synchronization policies live beside each seeder in prisma/seed/.
 * Historical gameplay data (puzzles, spins, claims, transactions) is
 * never created or rewritten here.
 */
import { PrismaClient } from "@prisma/client";
import { validateAllContent } from "./seed/validation";
import { SeedReport } from "./seed/report";
import { seedSpecies } from "./seed/seed-species";
import { seedItems } from "./seed/seed-items";
import { seedWorld } from "./seed/seed-world";
import { seedShops } from "./seed/seed-shops";
import { seedFishingSpots } from "./seed/seed-fishing";
import { seedDailyActivities } from "./seed/seed-daily";
import { seedRequestBoards } from "./seed/seed-requests";
import { seedForumBoards } from "./seed/seed-forums";
import { seedForageSpots } from "./seed/seed-foraging";
import { seedHollow } from "./seed/seed-hollow";
import { seedCave } from "./seed/seed-cave";
import { seedPetCare } from "./seed/seed-pet-care";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const content = validateAllContent();
  const report = new SeedReport();
  await seedSpecies(prisma, content.species, report);
  await seedItems(prisma, content, report);
  await seedWorld(prisma, content.regions, report);
  await seedShops(prisma, content, report);
  await seedDailyActivities(prisma, content.daily, report);
  await seedFishingSpots(prisma, content.fishingSpots, report);
  await seedRequestBoards(prisma, content.requestBoards, report);
  await seedForumBoards(prisma, content.forumBoards, report);
  // After the world: spots attach to locations that must already exist.
  await seedForageSpots(prisma, content.forageSpots, report);
  await seedHollow(prisma, content.hollow, report);
  // After items: the hoard names them by slug.
  await seedCave(prisma, content.cave, report);
  // After items: remedies name them by slug.
  await seedPetCare(prisma, content.pets, report);
  report.print();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
