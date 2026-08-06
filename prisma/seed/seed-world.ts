import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Regions and locations: UPSERT with an explicit lifecycle — the
 * `published` flag in content controls visibility; omission from content
 * never deletes or unpublishes a row.
 */
export async function seedWorld(
  prisma: PrismaClient,
  regions: GameContent["regions"],
  report: SeedReport,
): Promise<void> {
  for (const region of regions) {
    const { locations, ...fields } = region;
    let dbRegion = await prisma.region.findUnique({
      where: { slug: region.slug },
    });
    if (!dbRegion) {
      dbRegion = await prisma.region.create({ data: fields });
      report.record("Regions", "created");
    } else if (sameFields(dbRegion, fields)) {
      report.record("Regions", "unchanged");
    } else {
      dbRegion = await prisma.region.update({
        where: { slug: region.slug },
        data: fields,
      });
      report.record("Regions", "updated");
    }

    for (const location of locations) {
      const data = {
        ...location,
        mapX: location.mapX ?? null,
        mapY: location.mapY ?? null,
        regionId: dbRegion.id,
      };
      const existing = await prisma.location.findUnique({
        where: {
          regionId_slug: { regionId: dbRegion.id, slug: location.slug },
        },
      });
      if (!existing) {
        await prisma.location.create({ data });
        report.record("Locations", "created");
      } else if (sameFields(existing, data)) {
        report.record("Locations", "unchanged");
      } else {
        await prisma.location.update({ where: { id: existing.id }, data });
        report.record("Locations", "updated");
      }
    }
  }
}
