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

/**
 * The seed of a player's descent (ADR-59).
 *
 * Test setup only, and the fact that this needs direct database access is
 * the point: the seed decides every door and reaches no response, no log
 * line, and no idempotency payload. A browser test can only walk the
 * stair deliberately by cheating at the level a player cannot reach.
 */
export async function caveDelveSeed(username: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const delve = await prisma.caveDelve.findFirst({
      where: { user: { normalizedUsername: username.toLowerCase() } },
      orderBy: { startedAt: "desc" },
    });
    return delve?.seed ?? "";
  } finally {
    await prisma.$disconnect();
  }
}

/** The two door labels of each room, in depth order. */
export async function caveSectionDoors(): Promise<Array<[string, string]>> {
  const prisma = new PrismaClient();
  try {
    const sections = await prisma.caveSection.findMany({
      orderBy: { sectionIndex: "asc" },
    });
    return sections.map((section) => [section.doorOne, section.doorTwo]);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Gives a companion a specific ailment, today (ADR-60).
 *
 * There is no clickable path to this and there must not be: onset is an
 * HMAC over (pet, game date) keyed by the server secret, precisely so that
 * refreshing cannot re-roll it. A browser test therefore cannot make a
 * companion ill by playing — it can only write the row the roll would have
 * written. Everything after this point is the real flow: the card, the
 * refusals, and the cure all go through the ordinary server action.
 *
 * Returns the ailment's display name, which the copy under test uses.
 */
export async function giveAilment(
  username: string,
  kindKey: string,
): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const pet = await prisma.pet.findFirstOrThrow({
      where: { owner: { normalizedUsername: username.toLowerCase() } },
      orderBy: { createdAt: "asc" },
    });
    const kind = await prisma.ailmentKind.findUniqueOrThrow({
      where: { key: kindKey },
    });
    const now = new Date();
    await prisma.petAilment.upsert({
      where: {
        petId_gameDate: {
          petId: pet.id,
          gameDate: now.toISOString().slice(0, 10),
        },
      },
      create: {
        petId: pet.id,
        kindId: kind.id,
        gameDate: now.toISOString().slice(0, 10),
        startedAt: now,
        restsAt: new Date(now.getTime() + kind.restHours * 3_600_000),
      },
      update: {
        kindId: kind.id,
        treatedAt: null,
        startedAt: now,
        restsAt: new Date(now.getTime() + kind.restHours * 3_600_000),
      },
    });
    return kind.name;
  } finally {
    await prisma.$disconnect();
  }
}

/** A companion's coat and bond, for asserting what a care action moved. */
export async function petCare(
  username: string,
): Promise<{ coat: number; bond: number }> {
  const prisma = new PrismaClient();
  try {
    const pet = await prisma.pet.findFirstOrThrow({
      where: { owner: { normalizedUsername: username.toLowerCase() } },
      orderBy: { createdAt: "asc" },
    });
    return { coat: pet.coat, bond: pet.bond };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Scruffs a companion's coat up so brushing has somewhere to go.
 *
 * A starter companion arrives well kept and the coat only slips with the
 * clock, which a browser test cannot wait for — the same reason
 * grantFoodTheCompanionLoves has to make room in a full stomach.
 */
export async function setPetCoat(username: string, coat: number): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const pet = await prisma.pet.findFirstOrThrow({
      where: { owner: { normalizedUsername: username.toLowerCase() } },
      orderBy: { createdAt: "asc" },
    });
    await prisma.pet.update({
      where: { id: pet.id },
      data: { coat, statsUpdatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** How many of an item a player is holding right now. */
export async function heldQuantity(
  username: string,
  itemSlug: string,
): Promise<number> {
  const prisma = new PrismaClient();
  try {
    const entry = await prisma.inventoryEntry.findFirst({
      where: {
        user: { normalizedUsername: username.toLowerCase() },
        item: { slug: itemSlug },
      },
    });
    return entry?.quantity ?? 0;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Settles anything a companion has picked up, so a test can assert on a
 * well one.
 *
 * Onset is a roll, and a starter companion has a real chance of being ill
 * on the day the suite runs — which would make "a healthy companion shows
 * no panel" fail about one run in ten. Deleting the row would not help:
 * the roll is deterministic, so the next page view would draw the same
 * ailment again. Marking it treated is what a player with the right bottle
 * would have done, and it is the state the code already treats as well.
 */
export async function settleAilments(username: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.petAilment.updateMany({
      where: {
        treatedAt: null,
        pet: { owner: { normalizedUsername: username.toLowerCase() } },
      },
      data: { treatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}
