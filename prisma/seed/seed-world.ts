import type { PrismaClient } from "@prisma/client";
import type { GameContent } from "../content";
import { sameFields, type SeedReport } from "./report";

/**
 * Regions, locations, and location activity attachments.
 *
 * Regions/locations: UPSERT with an explicit lifecycle — the `published`
 * flag in content controls visibility; omission from content never deletes
 * or unpublishes a row.
 *
 * Attachments: SYNC_AND_DEACTIVATE_MISSING — an attachment removed from
 * content is deactivated, never deleted, so historical activity results
 * (spins, claims, completions) keep their references.
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
      const { activities, ...locationFields } = location;
      const data = {
        ...locationFields,
        mapX: location.mapX ?? null,
        mapY: location.mapY ?? null,
        regionId: dbRegion.id,
      };
      const existing = await prisma.location.findUnique({
        where: {
          regionId_slug: { regionId: dbRegion.id, slug: location.slug },
        },
      });
      let locationId: string;
      if (!existing) {
        const created = await prisma.location.create({ data });
        locationId = created.id;
        report.record("Locations", "created");
      } else {
        locationId = existing.id;
        if (sameFields(existing, data)) {
          report.record("Locations", "unchanged");
        } else {
          await prisma.location.update({ where: { id: existing.id }, data });
          report.record("Locations", "updated");
        }
      }

      await syncLocationActivities(prisma, locationId, activities ?? [], report);
    }
  }
}

type AuthoredActivity = NonNullable<
  GameContent["regions"][number]["locations"][number]["activities"]
>[number];

async function syncLocationActivities(
  prisma: PrismaClient,
  locationId: string,
  authored: readonly AuthoredActivity[],
  report: SeedReport,
): Promise<void> {
  const existing = await prisma.locationActivity.findMany({
    where: { locationId },
  });
  const seen = new Set<string>();

  // Display order is uniquely constrained per location, so an attachment
  // moving into a slot another one currently holds would collide on a
  // single pass. Rows that need to move are parked at negative slots
  // (which no authored attachment may use) before the authored values are
  // written. Change detection always compares against the snapshot taken
  // above, so parking never shows up as a content change.
  const authoredByIdentity = new Map(
    authored.map((activity) => [`${activity.type}:${activity.activityKey}`, activity]),
  );
  const parked = new Set<string>();
  for (const row of existing) {
    const target = authoredByIdentity.get(`${row.type}:${row.activityKey}`);
    if (!target || target.displayOrder !== row.displayOrder) {
      parked.add(row.id);
    }
  }
  let parkingSlot = -1;
  for (const row of existing) {
    if (parked.has(row.id)) {
      await prisma.locationActivity.update({
        where: { id: row.id },
        data: { displayOrder: parkingSlot },
      });
      parkingSlot -= 1;
    }
  }

  for (const activity of authored) {
    const identity = `${activity.type}:${activity.activityKey}`;
    seen.add(identity);
    const current = existing.find(
      (row) => row.type === activity.type && row.activityKey === activity.activityKey,
    );
    const fields = {
      displayOrder: activity.displayOrder,
      active: activity.active ?? true,
    };
    if (!current) {
      await prisma.locationActivity.create({
        data: { locationId, type: activity.type, activityKey: activity.activityKey, ...fields },
      });
      report.record("Location activities", "created");
      continue;
    }
    const unchanged =
      current.displayOrder === fields.displayOrder &&
      current.active === fields.active;
    if (unchanged && !parked.has(current.id)) {
      report.record("Location activities", "unchanged");
      continue;
    }
    await prisma.locationActivity.update({
      where: { id: current.id },
      data: fields,
    });
    report.record("Location activities", unchanged ? "unchanged" : "updated");
  }

  for (const row of existing) {
    const identity = `${row.type}:${row.activityKey}`;
    if (!seen.has(identity) && row.active) {
      await prisma.locationActivity.update({
        where: { id: row.id },
        data: { active: false },
      });
      report.record("Location activities", "deactivated");
    }
  }
}
