import { Prisma, type PlayerShop } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { BASE_SHOP_CAPACITY } from "../../config";

/**
 * Shop lifecycle commands. Slugs derive from the normalized username, so
 * casing can never collide; once created a slug is stable — display-name
 * changes never move a public shop URL (docs/conventions.md).
 */

/**
 * Finds or lazily creates the user's shop (available from onboarding).
 *
 * Prisma's `upsert` is not atomic on the client — it reads, then inserts —
 * so two concurrent first uses (a double-tapped first listing, two tabs)
 * both missed the read and one hit a raw `P2002` that escaped as a generic
 * error and was logged as a defect, contradicting the error contract in
 * docs/conventions.md. Create-then-catch-and-reread is the same pattern
 * ensureDailyPuzzles, ensureState, and chooseStarter already use: the
 * loser of the race reads the winner's row instead of failing.
 */
export async function ensurePlayerShop(
  db: DbClient,
  userId: string,
): Promise<PlayerShop> {
  const existing = await db.playerShop.findUnique({ where: { ownerId: userId } });
  if (existing) {
    return existing;
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  try {
    return await db.playerShop.create({
      data: {
        ownerId: userId,
        slug: user.normalizedUsername,
        name: `${user.username}'s Stall`,
        description: "",
        listingCapacity: BASE_SHOP_CAPACITY,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.playerShop.findUniqueOrThrow({ where: { ownerId: userId } });
    }
    throw error;
  }
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
