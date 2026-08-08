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

/**
 * Tops a player's wallet up so a browser test can reach a purchase the
 * game's ordinary faucets would take weeks to fund — the Hollow's grounds
 * and airs are priced in days of play on purpose. Test setup only; the
 * purchase under test still goes through the real server action.
 */
export async function grantCoinsToPlayer(
  username: string,
  coins: bigint,
): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirstOrThrow({
        where: { normalizedUsername: username.toLowerCase() },
      });
      const delta = coins - user.coins;
      if (delta === 0n) return;
      await tx.user.update({ where: { id: user.id }, data: { coins } });
      // The ledger row is not optional even in a test helper: CI runs
      // reconciliation, which derives every wallet from its ledger, and a
      // silent top-up would show up there as a real integrity finding.
      await tx.transaction.create({
        data: {
          userId: user.id,
          type: "ADMIN_ADJUST",
          coinsDelta: delta,
          note: "browser test top-up",
        },
      });
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Grants a food this player's companion is guaranteed to love, and returns
 * its name.
 *
 * A palate is per-pet and deliberately never stated by the game, so a
 * browser test cannot discover one by clicking — it would have to feed the
 * whole satchel and hope. This derives the answer the same way the server
 * does and hands over one matching food, so the flow under test is still
 * the real one: the player feeds an item and the server decides what the
 * companion made of it.
 */
export async function grantFoodTheCompanionLoves(
  username: string,
): Promise<string> {
  const { palateFor } = await import("../../src/server/modules/pets/palate");
  const prisma = new PrismaClient();
  try {
    const pet = await prisma.pet.findFirstOrThrow({
      where: { owner: { normalizedUsername: username.toLowerCase() } },
      orderBy: { createdAt: "asc" },
    });
    const palate = palateFor(pet.palateSeed);
    // The least filling one, so a well-fed starter companion has room.
    const item = await prisma.item.findFirstOrThrow({
      where: {
        type: "FOOD",
        lifecycle: "ACTIVE",
        tags: { some: { slug: palate.foodDelight } },
      },
      orderBy: { hungerRestore: "asc" },
    });
    await prisma.inventoryEntry.upsert({
      where: { userId_itemId: { userId: pet.ownerId, itemId: item.id } },
      create: { userId: pet.ownerId, itemId: item.id, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    // Make room. An earlier spec in the same file deliberately stuffs this
    // companion to prove PET_FULL refuses a meal, and hunger only comes
    // back with the clock — which a browser test cannot wait for.
    await prisma.pet.update({
      where: { id: pet.id },
      data: { hunger: 40, statsUpdatedAt: new Date() },
    });
    return item.name;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Backdates an account's creation so it can trade with other players.
 *
 * Trading opens after a day (TRADE_ELIGIBLE_AFTER_HOURS), which stops a
 * farm of throwaway accounts carrying value out on the minute they are
 * made. A browser test cannot wait a day, and the flow under test is the
 * ordinary one an established player uses — so the account is aged, not
 * the rule relaxed.
 */
export async function ageAccountForTrading(username: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.user.updateMany({
      where: { normalizedUsername: username.toLowerCase() },
      data: { createdAt: new Date(Date.now() - 3 * 86_400_000) },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Empties the communal shelf before a browser test runs.
 *
 * The shelf is one shared world object with a capacity, so unlike every
 * other fixture in this suite it cannot be made unique per run: a previous
 * run's lots are still standing on the same plank the current run is
 * asserting about, and they carry Take buttons that a locator filtered
 * only by item name will find. Lots expire on their own within two hours,
 * so this is impatience rather than cleanup — the same spirit as clearing
 * rate-limit windows instead of waiting five minutes.
 */
export async function clearGiveawayShelf(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.giveawayTake.deleteMany({});
    await prisma.giveawayOffering.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Makes a signed-up account an administrator.
 *
 * Promotion is itself an administrative act, so there is no in-game path
 * to it — the alpha bootstrap works off a hardcoded username, which a
 * browser test should not be pinned to. Setting the column directly is
 * test setup; every privileged surface under test still gates on the role
 * through the real `requireAdmin`.
 */
export async function promoteToAdmin(username: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.user.updateMany({
      where: { normalizedUsername: username.toLowerCase() },
      data: { role: "ADMIN" },
    });
  } finally {
    await prisma.$disconnect();
  }
}
