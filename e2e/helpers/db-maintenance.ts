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
 * Fast-forwards anything a companion has picked up past its own end, so a
 * test can assert on a well one.
 *
 * Onset is a roll, and a starter companion has a real chance of being ill
 * on the day the suite runs — which would make "a healthy companion shows
 * no panel" fail about one run in ten.
 *
 * Deleting the row would not help: the roll is deterministic, so the next
 * page view draws the same ailment again. Setting `treatedAt` is refused by
 * a CHECK constraint, correctly — treated means a remedy was given, and
 * there is no remedy here. So this backdates `restsAt` instead, which is
 * the honest state anyway: it passed on its own, which is what every
 * ailment does.
 */
export async function settleAilments(username: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const past = new Date(Date.now() - 60_000);
    await prisma.petAilment.updateMany({
      where: {
        treatedAt: null,
        restsAt: { gt: past },
        pet: { owner: { normalizedUsername: username.toLowerCase() } },
      },
      // startedAt moves too: a CHECK requires restsAt > startedAt, because
      // an ailment that never ends is the one shape the feature forbids.
      data: { startedAt: new Date(past.getTime() - 60_000), restsAt: past },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Sets a keepsake out for a companion to have found (ADR-61).
 *
 * Like `giveAilment`, there is deliberately no clickable path: the draw is
 * an HMAC over (pet, game date) so it cannot be re-rolled, which also means
 * a browser test cannot make one happen by playing. It writes the row the
 * roll would have written; everything after — the card, the tap, the grant
 * — is the real flow. Returns the item's display name.
 */
export async function setOutKeepsake(username: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const pet = await prisma.pet.findFirstOrThrow({
      where: { owner: { normalizedUsername: username.toLowerCase() } },
      orderBy: { createdAt: "asc" },
    });
    const kind = await prisma.keepsakeKind.findFirstOrThrow({
      where: { active: true },
      include: { item: true },
      orderBy: { id: "asc" },
    });
    await prisma.petKeepsake.deleteMany({ where: { petId: pet.id } });
    await prisma.petKeepsake.create({
      data: {
        petId: pet.id,
        kindId: kind.id,
        gameDate: new Date().toISOString().slice(0, 10),
        line: kind.line,
      },
    });
    return kind.item.name;
  } finally {
    await prisma.$disconnect();
  }
}

/** Lets a companion be sat with again, without waiting three hours. */
export async function clearSittingCooldown(username: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.pet.updateMany({
      where: { owner: { normalizedUsername: username.toLowerCase() } },
      data: { lastSatWithAt: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Empties a player's satchel, so "you can always do something for them"
 * can be asserted rather than assumed.
 *
 * A new account starts with a small pack, so the state this exists to
 * prove — nothing to feed with, nothing to play with, nothing to brush
 * with — is not reachable by playing on day one.
 */
export async function emptySatchel(username: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.inventoryEntry.deleteMany({
      where: { user: { normalizedUsername: username.toLowerCase() } },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * The arcade runs a player has finished at one game (ADR-62).
 *
 * Read directly, because the numbers that matter are the ones the SERVER
 * derived — the score and the tick count it worked out by replaying the
 * submitted trace. Asserting on the page would only prove the page can
 * echo itself; asserting on these proves the replay ran.
 */
export async function arcadeRuns(
  username: string,
  game: "PAPER_BIRD" | "TREE_CLIMB",
): Promise<Array<{ status: string; score: number; ticks: number }>> {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.arcadeRun.findMany({
      where: {
        game,
        user: { normalizedUsername: username.toLowerCase() },
      },
      orderBy: { startedAt: "asc" },
      select: { status: true, score: true, ticks: true },
    });
    return runs.map((run) => ({ ...run, status: String(run.status) }));
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Spends a player's three claims for today at one arcade game.
 *
 * A browser test cannot play a twitch game well enough to earn three
 * paying runs in a reasonable time — and the payout arithmetic is settled
 * deterministically in the domain tests. This writes the rows the domain
 * writes so the SPENT state can be asserted in the interface, which is the
 * part only a browser can check.
 */
export async function spendArcadeClaims(
  username: string,
  game: "PAPER_BIRD" | "TREE_CLIMB",
): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirstOrThrow({
      where: { normalizedUsername: username.toLowerCase() },
    });
    const gameDate = new Date().toISOString().slice(0, 10);
    for (let claimIndex = 1; claimIndex <= 3; claimIndex += 1) {
      const existing = await prisma.arcadePayout.findFirst({
        where: { userId: user.id, game, gameDate, claimIndex },
      });
      if (existing) continue;
      const run = await prisma.arcadeRun.create({
        data: {
          userId: user.id,
          game,
          gameDate,
          seed: `e2e${claimIndex}0000`,
          rulesVersion: 1,
          status: "FINISHED",
          score: 10,
          ticks: 600,
        },
      });
      await prisma.arcadePayout.create({
        data: {
          userId: user.id,
          gameDate,
          game,
          claimIndex,
          runId: run.id,
          score: 10,
          coins: 21n,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
