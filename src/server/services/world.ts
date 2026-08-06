import type { PrismaClient } from "@prisma/client";

/**
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
      },
    },
  });
}

/**
 * A single published location by slug, or null. A location is public only
 * while its region is also published.
 */
export async function getPublishedLocation(db: PrismaClient, slug: string) {
  return db.location.findFirst({
    where: { slug, published: true, region: { published: true } },
    include: { region: true },
  });
}
