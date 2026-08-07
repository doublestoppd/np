import type { DbReader } from "@/server/db";

/**
 * Page-based world navigation: World Map -> Region Map -> Location.
 * Published regions with their published locations, in display order.
 * Unpublished content is invisible to players (docs/content-model.md).
 */
export async function getExploreRegions(db: DbReader) {
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
export async function getPublishedRegion(db: DbReader, slug: string) {
  return db.region.findFirst({
    where: { slug, published: true },
    include: {
      locations: {
        where: { published: true },
        orderBy: { sortOrder: "asc" },
        include: {
          // The activity attachments, not the legacy npcShop relation:
          // CLAUDE.md's world model makes attachments authoritative, and
          // reading the shop alone left word puzzles, the wheel, the meal,
          // and the request board looking like flavor pages on the map.
          activities: {
            where: { active: true },
            orderBy: { displayOrder: "asc" },
            select: { type: true },
          },
        },
      },
    },
  });
}

/**
 * A single published location addressed by region + location slug, or null,
 * together with its active activity attachments in authored display order.
 *
 * The world domain owns locations and their attachments, but knows nothing
 * about what any activity DOES: an attachment is a type plus a stable
 * `activityKey` that the owning domain resolves. That is what keeps this
 * module free of imports from commerce, daily, or requests.
 */
export async function getPublishedLocation(
  db: DbReader,
  regionSlug: string,
  locationSlug: string,
) {
  return db.location.findFirst({
    where: {
      slug: locationSlug,
      published: true,
      region: { slug: regionSlug, published: true },
    },
    include: {
      region: true,
      activities: {
        where: { active: true },
        orderBy: { displayOrder: "asc" },
      },
    },
  });
}

/** One active attachment, as the composition layer receives it. */
export type LocationActivityView = Awaited<
  ReturnType<typeof getPublishedLocation>
> extends infer T
  ? T extends { activities: (infer A)[] }
    ? A
    : never
  : never;

/**
 * Every active activity attachment in the published world, with its
 * location and region, in world order.
 *
 * The world domain still knows nothing about what any of these DO — this
 * returns types and keys, exactly as `getPublishedLocation` does. The
 * composition layer (src/server/modules/directory) is what turns them into
 * a player's to-do list by asking each owning domain.
 */
export async function listWorldActivities(db: DbReader) {
  return db.locationActivity.findMany({
    where: {
      active: true,
      location: { published: true, region: { published: true } },
    },
    orderBy: [
      { location: { region: { sortOrder: "asc" } } },
      { location: { sortOrder: "asc" } },
      { displayOrder: "asc" },
    ],
    select: {
      type: true,
      activityKey: true,
      location: {
        select: {
          name: true,
          slug: true,
          region: { select: { slug: true } },
        },
      },
    },
  });
}
