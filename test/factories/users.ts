import type { PrismaClient, User } from "@prisma/client";
import { normalizeUsername } from "@/server/modules/accounts/identity";

/** Deterministic user factory; keeps normalizedUsername consistent. */
export async function createTestUser(
  db: PrismaClient,
  {
    username,
    coins = 200n,
    isAdmin = false,
    commerceDisabledAt = null,
  }: {
    username: string;
    coins?: bigint;
    isAdmin?: boolean;
    commerceDisabledAt?: Date | null;
  },
): Promise<User> {
  return db.user.create({
    data: {
      username,
      normalizedUsername: normalizeUsername(username),
      passwordHash: "x",
      coins,
      isAdmin,
      commerceDisabledAt,
    },
  });
}

/**
 * FK-safe cleanup for a suite's users (ledger rows block cascade by
 * design). Deletes dependents in dependency order.
 */
export async function cleanupTestUsers(
  db: PrismaClient,
  usernamePrefix: string,
): Promise<void> {
  const userFilter = { username: { startsWith: usernamePrefix } };
  await db.itemProvenanceEvent.deleteMany({
    where: {
      OR: [
        { fromUser: userFilter },
        { toUser: userFilter },
        { itemInstance: { owner: userFilter } },
      ],
    },
  });
  await db.transaction.deleteMany({ where: { user: userFilter } });
  await db.securityEvent.deleteMany({ where: { user: userFilter } });
  await db.playerShopListing.deleteMany({ where: { seller: userFilter } });
  await db.itemInstance.deleteMany({ where: { owner: userFilter } });
  await db.playerShopUpgradePurchase.deleteMany({
    where: { shop: { owner: userFilter } },
  });
  await db.playerShop.deleteMany({ where: { owner: userFilter } });
  await db.starterClaim.deleteMany({ where: { user: userFilter } });
  await db.user.deleteMany({ where: userFilter });
}
