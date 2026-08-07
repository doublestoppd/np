import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Fishing spots: UPSERT spots and their tables, and DEACTIVATE (never
 * delete) entries that leave the content file — `FishCatch` and
 * `FishRecord` rows reference species forever, and a water's history must
 * stay readable after its table is retuned.
 */
export async function seedFishingSpots(
  prisma: PrismaClient,
  spots: GameContent["fishingSpots"],
  report: SeedReport,
): Promise<void> {
  for (const spot of spots) {
    const location = await prisma.location.findFirst({
      where: { slug: spot.locationSlug, region: { slug: spot.regionSlug } },
      select: { id: true },
    });
    if (!location) {
      // Offline validation already asserts this; failing loudly here keeps
      // a partially-seeded database from looking healthy.
      throw new Error(
        `Fishing spot ${spot.slug} references unknown location ${spot.regionSlug}/${spot.locationSlug}`,
      );
    }

    const fields = {
      locationId: location.id,
      name: spot.name,
      description: spot.description,
      dailyLimit: spot.dailyLimit,
      emptyWeight: spot.emptyWeight ?? 0,
      emptyFlavor: spot.emptyFlavor ?? "",
      active: spot.active ?? true,
    };
    let dbSpot = await prisma.fishingSpot.findUnique({
      where: { slug: spot.slug },
    });
    if (!dbSpot) {
      dbSpot = await prisma.fishingSpot.create({
        data: { slug: spot.slug, ...fields },
      });
      report.record("Fishing spots", "created");
    } else if (sameFields(dbSpot, fields)) {
      report.record("Fishing spots", "unchanged");
    } else {
      dbSpot = await prisma.fishingSpot.update({
        where: { slug: spot.slug },
        data: fields,
      });
      report.record("Fishing spots", "updated");
    }

    const authored = new Set<string>();
    for (const entry of spot.entries) {
      const item = await prisma.item.findUniqueOrThrow({
        where: { slug: entry.itemSlug },
        select: { id: true },
      });
      authored.add(item.id);
      const entryFields = {
        selectionWeight: entry.selectionWeight,
        minLength: entry.minLength,
        maxLength: entry.maxLength,
        active: entry.active ?? true,
      };
      const existing = await prisma.fishingSpotEntry.findUnique({
        where: { spotId_itemId: { spotId: dbSpot.id, itemId: item.id } },
      });
      if (!existing) {
        await prisma.fishingSpotEntry.create({
          data: { spotId: dbSpot.id, itemId: item.id, ...entryFields },
        });
        report.record("Fishing entries", "created");
      } else if (sameFields(existing, entryFields)) {
        report.record("Fishing entries", "unchanged");
      } else {
        await prisma.fishingSpotEntry.update({
          where: { id: existing.id },
          data: entryFields,
        });
        report.record("Fishing entries", "updated");
      }
    }

    const orphaned = await prisma.fishingSpotEntry.findMany({
      where: { spotId: dbSpot.id, active: true },
    });
    for (const row of orphaned) {
      if (!authored.has(row.itemId)) {
        await prisma.fishingSpotEntry.update({
          where: { id: row.id },
          data: { active: false },
        });
        report.record("Fishing entries", "deactivated");
      }
    }
  }
}
