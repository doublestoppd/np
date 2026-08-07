import type { DbClient, DbTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { normalizeUsername } from "@/server/modules/accounts/identity";


export type ProfileErrorCode = "PET_NOT_OWNED";

export class ProfileError extends DomainError {
  constructor(public readonly profileCode: ProfileErrorCode) {
    super(profileCode, "That companion isn't yours to feature.");
    this.name = "ProfileError";
  }
}

export interface UpdateProfileParams {
  userId: string;
  bio: string;
  title: string;
  /** Pet id to feature, or null to clear (falls back to oldest pet on read). */
  featuredPetId: string | null;
}

/**
 * Creates or updates the user's profile. The featured pet must belong to the
 * user — verified server-side inside the same transaction as the write, so a
 * client can never feature someone else's pet.
 */
export async function updateProfile(
  db: DbClient,
  { userId, bio, title, featuredPetId }: UpdateProfileParams,
): Promise<void> {
  await db.$transaction(async (tx: DbTx) => {
    if (featuredPetId !== null) {
      const pet = await tx.pet.findUnique({ where: { id: featuredPetId } });
      if (!pet || pet.ownerId !== userId) {
        throw new ProfileError("PET_NOT_OWNED");
      }
    }
    const data = { bio, title, featuredPetId };
    await tx.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  });
}

export interface PublicProfile {
  username: string;
  joinedAt: Date;
  title: string;
  bio: string;
  shop: { slug: string; name: string } | null;
  featuredPet: {
    name: string;
    speciesName: string;
    artKey: string;
  } | null;
  showcase: Array<{
    itemId: string;
    slug: string;
    name: string;
    description: string;
    artKey: string;
    categorySlug: string | null;
    categoryName: string | null;
  }>;
}

/**
 * Public-safe profile read used by /u/[username]. Selects only public fields
 * (never auth data), applies defaults when no Profile row exists, falls back
 * to the oldest companion when no featured pet is chosen, and hides showcase
 * entries whose owned quantity has dropped to zero (stale references must
 * never crash or falsify a profile — docs/profile-and-showcases.md).
 */
export async function getPublicProfile(
  db: DbClient,
  username: string,
): Promise<PublicProfile | null> {
  const user = await db.user.findFirst({
    where: {
      normalizedUsername: normalizeUsername(username),
      deactivatedAt: null,
    },
    select: {
      id: true,
      username: true,
      createdAt: true,
      profile: {
        select: {
          bio: true,
          title: true,
          featuredPet: {
            select: {
              ownerId: true,
              name: true,
              species: { select: { name: true, artKey: true } },
            },
          },
        },
      },
      playerShop: { select: { slug: true, name: true, active: true } },
    },
  });
  if (!user) {
    return null;
  }

  let featured = user.profile?.featuredPet ?? null;
  // Guard against a featured pet that no longer belongs to this user.
  if (featured && featured.ownerId !== user.id) {
    featured = null;
  }
  if (!featured) {
    const oldest = await db.pet.findFirst({
      where: { ownerId: user.id },
      orderBy: { createdAt: "asc" },
      select: {
        ownerId: true,
        name: true,
        species: { select: { name: true, artKey: true } },
      },
    });
    featured = oldest ?? null;
  }

  const entries = await db.showcaseEntry.findMany({
    where: {
      userId: user.id,
      item: { lifecycle: { in: ["ACTIVE", "RETIRED"] } },
    },
    orderBy: { position: "asc" },
    include: {
      item: { include: { category: true } },
      itemInstance: { select: { ownerId: true, status: true } },
    },
  });
  const owned = await db.inventoryEntry.findMany({
    where: {
      userId: user.id,
      itemId: { in: entries.map((entry) => entry.itemId) },
      quantity: { gt: 0 },
    },
    select: { itemId: true },
  });
  const ownedIds = new Set(owned.map((entry) => entry.itemId));

  return {
    username: user.username,
    joinedAt: user.createdAt,
    title: user.profile?.title ?? "",
    bio: user.profile?.bio ?? "",
    shop:
      user.playerShop && user.playerShop.active
        ? { slug: user.playerShop.slug, name: user.playerShop.name }
        : null,
    featuredPet: featured
      ? {
          name: featured.name,
          speciesName: featured.species.name,
          artKey: featured.species.artKey,
        }
      : null,
    showcase: entries
      .filter((entry) =>
        entry.item.stackable
          ? entry.itemInstanceId === null && ownedIds.has(entry.itemId)
          : entry.itemInstance !== null &&
            entry.itemInstance.ownerId === user.id &&
            entry.itemInstance.status === "OWNED",
      )
      .map((entry) => ({
        itemId: entry.itemId,
        slug: entry.item.slug,
        name: entry.item.name,
        description: entry.item.description,
        artKey: entry.item.artKey,
        categorySlug: entry.item.category?.slug ?? null,
        categoryName: entry.item.category?.name ?? null,
      })),
  };
}
