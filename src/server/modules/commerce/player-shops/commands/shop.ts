import type { PlayerShop } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { BASE_SHOP_CAPACITY } from "../../config";

/**
 * Shop lifecycle commands. Slugs derive from the normalized username, so
 * casing can never collide; once created a slug is stable — display-name
 * changes never move a public shop URL (docs/conventions.md).
 */

/** Finds or lazily creates the user's shop (available from onboarding). */
export async function ensurePlayerShop(
  db: DbClient,
  userId: string,
): Promise<PlayerShop> {
  const existing = await db.playerShop.findUnique({ where: { ownerId: userId } });
  if (existing) {
    return existing;
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return db.playerShop.upsert({
    where: { ownerId: userId },
    update: {},
    create: {
      ownerId: userId,
      slug: user.normalizedUsername,
      name: `${user.username}'s Stall`,
      description: "",
      listingCapacity: BASE_SHOP_CAPACITY,
    },
  });
}

export async function updateShopDetails(
  db: DbClient,
  {
    userId,
    name,
    description,
  }: { userId: string; name: string; description: string },
): Promise<void> {
  const shop = await ensurePlayerShop(db, userId);
  await db.playerShop.update({
    where: { id: shop.id },
    data: { name, description },
  });
}
