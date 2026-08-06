import type { PrismaClient } from "@prisma/client";

/**
 * Page-based world navigation: World Map -> Region Map -> Location.
 * Published regions with their published locations, in display order.
 * Unpublished content is invisible to players (docs/content-model.md).
 */
export async function getExploreRegions(db: PrismaClient) {
  return db.region.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
    include: {
      locations: {
        where: { published: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true },
      },
    },
  });
}

/** A published region and its published locations, for the region map. */
export async function getPublishedRegion(db: PrismaClient, slug: string) {
  return db.region.findFirst({
    where: { slug, published: true },
    include: {
      locations: {
        where: { published: true },
        orderBy: { sortOrder: "asc" },
        include: { npcShop: { select: { active: true } } },
      },
    },
  });
}

/**
 * A single published location addressed by region + location slug, or null.
 * A location is public only while its region is also published, and only
 * under its own region's route.
 */
export async function getPublishedLocation(
  db: PrismaClient,
  regionSlug: string,
  locationSlug: string,
) {
  return db.location.findFirst({
    where: {
      slug: locationSlug,
      published: true,
      region: { slug: regionSlug, published: true },
    },
    include: { region: true },
  });
}
