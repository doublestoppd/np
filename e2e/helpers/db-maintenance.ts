import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Dev-database maintenance for browser tests. The full suite signs up
 * more throwaway accounts inside one five-minute window than the
 * anti-abuse sign-up limit allows from a single origin, so each spec
 * file clears rate-limit windows before it starts. This mirrors what a
 * human tester waiting five minutes would experience — the production
 * limit itself is never changed.
 */
export async function clearRateLimitWindows(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.rateLimitWindow.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Grants a stackable item directly to a player, so browser tests can set
 * up inventory preconditions the UI has no deterministic path to (the
 * request-board foods come from the random daily meal). This is test
 * setup only — the flow under test still goes through the real server
 * action.
 */
export async function grantItemToPlayer(
  username: string,
  itemSlug: string,
  quantity: number,
): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirstOrThrow({
      where: { normalizedUsername: username.toLowerCase() },
    });
    const item = await prisma.item.findUniqueOrThrow({
      where: { slug: itemSlug },
    });
    await prisma.inventoryEntry.upsert({
      where: { userId_itemId: { userId: user.id, itemId: item.id } },
      create: { userId: user.id, itemId: item.id, quantity },
      update: { quantity },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** The player's current coin balance, for asserting authoritative grants. */
export async function coinBalance(username: string): Promise<bigint> {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirstOrThrow({
      where: { normalizedUsername: username.toLowerCase() },
    });
    return user.coins;
  } finally {
    await prisma.$disconnect();
  }
}
