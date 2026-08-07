import type { DbReader } from "@/server/db";

/**
 * What a companion has turned out to love.
 *
 * Note what this cannot express. There is no count, no total, no "3 of 8",
 * and no way to ask how many tastes exist — the palate itself is never
 * read here, only the record of what has already happened. That is the
 * difference between a shelf and a checklist, and it is structural rather
 * than a matter of restraint in the template: the view model has nowhere
 * to put the number, and a test pins its key set.
 */
export interface FondnessEntry {
  slug: string;
  name: string;
  artKey: string;
  categorySlug: string | null;
  firstAt: Date;
}

export interface FondnessView {
  petName: string;
  /** Most recently discovered first. Never empty — see below. */
  items: FondnessEntry[];
}

/**
 * Returns null when nothing has been discovered yet, so the caller renders
 * nothing at all rather than an empty state. "Nothing yet" every morning
 * about a thing with no schedule is a small daily reproach, the same
 * reasoning the arrivals panel follows (ADR-38).
 */
/**
 * The same shelf for a visitor, resolved from a username.
 *
 * Takes a username rather than a pet id on purpose: the public profile
 * projects only a companion's name, species, and art, and there is no
 * reason for a pet id to start crossing that boundary just to render a
 * shelf.
 */
export async function getPublicFondness(
  db: DbReader,
  { username }: { username: string },
): Promise<FondnessView | null> {
  const user = await db.user.findFirst({
    where: {
      normalizedUsername: username.trim().toLowerCase(),
      deactivatedAt: null,
    },
    select: {
      profile: { select: { featuredPetId: true } },
      pets: { orderBy: { createdAt: "asc" }, take: 1, select: { id: true } },
    },
  });
  if (!user) {
    return null;
  }
  // Mirrors the profile service's own fallback: the featured pet when one
  // is chosen, otherwise the oldest.
  const petId = user.profile?.featuredPetId ?? user.pets[0]?.id;
  return petId ? getFondness(db, { petId }) : null;
}

export async function getFondness(
  db: DbReader,
  { petId }: { petId: string },
): Promise<FondnessView | null> {
  const pet = await db.pet.findUnique({
    where: { id: petId },
    select: {
      name: true,
      delights: {
        orderBy: { firstAt: "desc" },
        include: { item: { select: { slug: true, name: true, artKey: true, category: { select: { slug: true } } } } },
      },
    },
  });
  if (!pet || pet.delights.length === 0) {
    return null;
  }
  return {
    petName: pet.name,
    items: pet.delights.map((delight) => ({
      slug: delight.item.slug,
      name: delight.item.name,
      artKey: delight.item.artKey,
      categorySlug: delight.item.category?.slug ?? null,
      firstAt: delight.firstAt,
    })),
  };
}
