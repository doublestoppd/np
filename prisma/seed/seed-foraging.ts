import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Foraging spots: UPSERT spots and their pool entries, and DEACTIVATE
 * (never delete) entries that leave the content file — `ForageFind` rows
 * reference items forever, and a spot's history must stay readable after
 * its pool is retuned.
 */
export async function seedForageSpots(
  prisma: PrismaClient,
  spots: GameContent["forageSpots"],
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
        `Forage spot ${spot.slug} references unknown location ${spot.regionSlug}/${spot.locationSlug}`,
      );
    }

    const fields = {
      locationId: location.id,
      name: spot.name,
      description: spot.description,
      dailyLimit: spot.dailyLimit,
      nothingWeight: spot.nothingWeight ?? 0,
      nothingFlavor: spot.nothingFlavor ?? "",
      active: spot.active ?? true,
    };
    let dbSpot = await prisma.forageSpot.findUnique({
      where: { slug: spot.slug },
    });
    if (!dbSpot) {
      dbSpot = await prisma.forageSpot.create({
        data: { slug: spot.slug, ...fields },
      });
      report.record("Forage spots", "created");
    } else if (sameFields(dbSpot, fields)) {
      report.record("Forage spots", "unchanged");
    } else {
      dbSpot = await prisma.forageSpot.update({
        where: { slug: spot.slug },
        data: fields,
      });
      report.record("Forage spots", "updated");
    }

    const authored = new Set<string>();
    for (const entry of spot.entries) {
      const item = await prisma.item.findUnique({
        where: { slug: entry.itemSlug },
        select: { id: true },
      });
      if (!item) {
        throw new Error(
          `Forage spot ${spot.slug} references unknown item ${entry.itemSlug}`,
        );
      }
      authored.add(item.id);
      const entryFields = {
        selectionWeight: entry.selectionWeight,
        minQuantity: entry.minQuantity ?? 1,
        maxQuantity: entry.maxQuantity ?? entry.minQuantity ?? 1,
        active: entry.active ?? true,
      };
      const existing = await prisma.forageSpotEntry.findUnique({
        where: { spotId_itemId: { spotId: dbSpot.id, itemId: item.id } },
      });
      if (!existing) {
        await prisma.forageSpotEntry.create({
          data: { spotId: dbSpot.id, itemId: item.id, ...entryFields },
        });
        report.record("Forage entries", "created");
      } else if (sameFields(existing, entryFields)) {
        report.record("Forage entries", "unchanged");
      } else {
        await prisma.forageSpotEntry.update({
          where: { id: existing.id },
          data: entryFields,
        });
        report.record("Forage entries", "updated");
      }
    }

    // Retired from the pool, not deleted: the finds it produced stay
    // readable, and re-adding the line later restores it in place.
    const removed = await prisma.forageSpotEntry.updateMany({
      where: {
        spotId: dbSpot.id,
        active: true,
        itemId: { notIn: [...authored] },
      },
      data: { active: false },
    });
    for (let i = 0; i < removed.count; i++) {
      report.record("Forage entries", "deactivated");
    }
  }

  // A spot removed from content closes rather than vanishing.
  const closed = await prisma.forageSpot.updateMany({
    where: { active: true, slug: { notIn: spots.map((spot) => spot.slug) } },
    data: { active: false },
  });
  for (let i = 0; i < closed.count; i++) {
    report.record("Forage spots", "deactivated");
  }
}
