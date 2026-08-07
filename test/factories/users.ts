import type { PrismaClient, User } from "@prisma/client";
import { normalizeUsername } from "@/server/modules/accounts/identity";

/**
 * How long ago a fixture account was created, by default.
 *
 * An ordinary player is not zero seconds old, and treating them as one
 * made every commerce test a test of the brand-new-account path. Trading
 * with other players opens after a day (TRADE_ELIGIBLE_AFTER_HOURS), so
 * the default fixture is a week old — an established player, which is
 * what almost every suite means. Pass `createdAt` to test the gate.
 */
const ESTABLISHED_DAYS = 7;

/** Deterministic user factory; keeps normalizedUsername consistent. */
export async function createTestUser(
  db: PrismaClient,
  {
    username,
    coins = 200n,
    isAdmin = false,
    commerceDisabledAt = null,
    createdAt = new Date(Date.now() - ESTABLISHED_DAYS * 86_400_000),
  }: {
    username: string;
    coins?: bigint;
    isAdmin?: boolean;
    commerceDisabledAt?: Date | null;
    createdAt?: Date;
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
      createdAt,
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
