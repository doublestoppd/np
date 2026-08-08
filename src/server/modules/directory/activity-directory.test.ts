/**
 * The activity directory: what the home dashboard and /games both render
 * from. Runs against a real database with its own fixture world.
 *
 * The defects this replaced were all "the card and the page disagree":
 * a request board with no entry anywhere, the meal's claim status shown
 * under the board's name, and the same link named two different things on
 * the two surfaces. So the assertions here are about agreement — the
 * directory's name, place, and availability must come from the same
 * sources the location page renders from.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  ACTIVITY_GROUPS,
  DIRECTORY_TYPES,
  getActivityDirectory,
  getGroupedActivityDirectory,
} from "./activity-directory";
import { getBoardView } from "@/server/modules/requests/queries";
import { completeCurrentRequest } from "@/server/modules/requests/complete";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

const prefix = fixturePrefix("dir");
const BOARD_KEY = `${prefix}-board`;
const LOCATION_NAME = "The Fixture Pantry";

describe.skipIf(!testDb)("activity directory (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let regionId: string;
  let locationId: string;
  let boardId: string;
  let itemId: string;

  /** This suite's own entry, ignoring anything a sibling suite published. */
  const ours = async () =>
    (await getActivityDirectory(db, { userId, gameDate: "2026-03-01" })).find(
      (entry) => entry.key === `REQUEST_BOARD:${BOARD_KEY}`,
    );

  beforeAll(async () => {
    userId = (
      await createTestUser(db, {
        username: `${prefix}_${randomUUID().slice(0, 6)}`,
        coins: 0n,
      })
    ).id;
    itemId = (await createTestItem(db, { slug: `${prefix}-ingredient` })).id;

    regionId = (
      await db.region.create({
        data: {
          slug: `${prefix}-region`,
          name: "Fixture Region",
          description: "Test only",
          artKey: `${prefix}-region`,
          sortOrder: 900,
          published: true,
        },
      })
    ).id;
    locationId = (
      await db.location.create({
        data: {
          slug: `${prefix}-location`,
          regionId,
          name: LOCATION_NAME,
          description: "Test only",
          artKey: `${prefix}-location`,
          sortOrder: 0,
          published: true,
        },
      })
    ).id;

    const board = await db.requestBoard.create({
      data: {
        key: BOARD_KEY,
        name: "Fixture Requests",
        description: "Fixture board.",
        active: true,
        dailyCompletionLimit: 2,
        requests: {
          create: [0, 1].map((position) => ({
            slug: `${prefix}-request-${position}`,
            title: `Fixture request ${position}`,
            flavorText: "",
            sequencePosition: position,
            rewardCoins: 40n,
            active: true,
            requirements: { create: [{ itemId, quantity: 1 }] },
          })),
        },
      },
    });
    boardId = board.id;

    await db.locationActivity.create({
      data: {
        locationId,
        type: "REQUEST_BOARD",
        activityKey: BOARD_KEY,
        displayOrder: 0,
        active: true,
      },
    });
  });

  afterAll(async () => {
    await db.requestCompletion.deleteMany({ where: { boardId } });
    await db.playerRequestBoardProgress.deleteMany({ where: { boardId } });
    await db.requestRequirement.deleteMany({
      where: { requestDefinition: { boardId } },
    });
    await db.requestDefinition.deleteMany({ where: { boardId } });
    await db.requestBoard.delete({ where: { id: boardId } });
    await db.locationActivity.deleteMany({ where: { locationId } });
    await db.transaction.deleteMany({ where: { userId } });
    await db.location.deleteMany({ where: { regionId } });
    await db.region.delete({ where: { id: regionId } });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
  });

  it("lists a request board at all, with its own name and place", async () => {
    // Before this module existed the board appeared on no dashboard, and
    // /games showed the daily meal's name and status in its place.
    const entry = await ours();
    const board = await getBoardView(db, { userId, boardKey: BOARD_KEY });
    expect(entry).toBeDefined();
    expect(entry!.name).toBe(board!.name);
    expect(entry!.place).toBe(LOCATION_NAME);
    expect(entry!.href).toBe(`/explore/${prefix}-region/${prefix}-location`);
    expect(entry!.availability).toEqual({ kind: "AVAILABLE" });
  });

  it("tracks the player's real progress through the day", async () => {
    await giveStack(db, { userId, itemId, quantity: 5 });
    await completeCurrentRequest(db, {
      userId,
      boardKey: BOARD_KEY,
      expectedStateVersion: 0,
      idempotencyKey: randomUUID(),
      gameDate: "2026-03-01",
    });
    expect((await ours())!.availability).toEqual({
      kind: "IN_PROGRESS",
      done: 1,
      total: 2,
    });

    await completeCurrentRequest(db, {
      userId,
      boardKey: BOARD_KEY,
      expectedStateVersion: 1,
      idempotencyKey: randomUUID(),
      gameDate: "2026-03-01",
    });
    expect((await ours())!.availability).toEqual({ kind: "DONE" });
  });

  it("says closed rather than inviting a player into a closed activity", async () => {
    // Both surfaces used to derive availability purely from "has the player
    // acted today", so a deactivated activity still advertised itself.
    await db.requestBoard.update({
      where: { id: boardId },
      data: { active: false },
    });
    try {
      expect((await ours())!.availability).toEqual({ kind: "UNAVAILABLE" });
    } finally {
      await db.requestBoard.update({
        where: { id: boardId },
        data: { active: true },
      });
    }
  });

  it("hides an attachment whose location was unpublished", async () => {
    await db.location.update({
      where: { id: locationId },
      data: { published: false },
    });
    try {
      expect(await ours()).toBeUndefined();
    } finally {
      await db.location.update({
        where: { id: locationId },
        data: { published: true },
      });
    }
  });

  it("omits NPC shops: a shop is somewhere to spend, not something to play", async () => {
    await db.npcShop.create({
      data: {
        slug: `${prefix}-shop`,
        name: "Fixture Shop",
        description: "Test only",
        locationId,
        keeperCopy: "",
        keeperArtKey: `${prefix}-keeper`,
        active: true,
      },
    });
    await db.locationActivity.create({
      data: {
        locationId,
        type: "NPC_SHOP",
        activityKey: `${prefix}-shop`,
        displayOrder: 1,
        active: true,
      },
    });
    try {
      const entries = await getActivityDirectory(db, { userId });
      expect(
        entries.some((entry) => entry.key === `NPC_SHOP:${prefix}-shop`),
      ).toBe(false);
    } finally {
      await db.locationActivity.deleteMany({
        where: { locationId, type: "NPC_SHOP" },
      });
      await db.npcShop.deleteMany({ where: { locationId } });
    }
  });
});

/**
 * Grouping and sorting. Pure — these are properties of the shape of the
 * page rather than of any player's day, so they need no fixture world.
 */
describe("activity groups", () => {
  it("gives every listed activity a section", () => {
    // The page renders sections, so a type in the directory with no group
    // would be fetched, described, and then silently dropped on the floor.
    // Adding a type to DIRECTORY_TYPES and forgetting ACTIVITY_GROUPS is
    // exactly the mistake this catches.
    const grouped = new Set(
      ACTIVITY_GROUPS.flatMap((group) => group.types as readonly string[]),
    );
    const missing = DIRECTORY_TYPES.filter((type) => !grouped.has(type));
    expect(missing, "add these to ACTIVITY_GROUPS").toEqual([]);
  });

  it("never files one activity under two sections", () => {
    const seen = new Set<string>();
    const twice: string[] = [];
    for (const group of ACTIVITY_GROUPS) {
      for (const type of group.types as readonly string[]) {
        if (seen.has(type)) twice.push(type);
        seen.add(type);
      }
    }
    expect(twice).toEqual([]);
  });

  it("lists gathering, which used to be left out", () => {
    expect(DIRECTORY_TYPES).toContain("FORAGING");
    expect(DIRECTORY_TYPES).toContain("FISHING");
    const gathering = ACTIVITY_GROUPS.find((g) => g.key === "gathering");
    expect(gathering?.types).toEqual(
      expect.arrayContaining(["FORAGING", "FISHING"]),
    );
  });
});

describe.skipIf(!testDb)("grouped directory (integration)", () => {
  const db = testDb as PrismaClient;

  it("sorts what is still open above what is finished", async () => {
    const user = await createTestUser(db, {
      username: `${prefix}g${randomUUID().slice(0, 6)}`,
    });
    const groups = await getGroupedActivityDirectory(db, { userId: user.id });
    expect(groups.length).toBeGreaterThan(0);

    const rank = { AVAILABLE: 0, IN_PROGRESS: 1, DONE: 2, UNAVAILABLE: 3 };
    for (const group of groups) {
      // Never a heading over nothing.
      expect(group.entries.length).toBeGreaterThan(0);
      const ranks = group.entries.map((e) => rank[e.availability.kind]);
      expect(
        [...ranks].sort((a, b) => a - b),
        `${group.key} is out of order`,
      ).toEqual(ranks);
    }
  });

  it("puts every entry in exactly one section", async () => {
    const user = await createTestUser(db, {
      username: `${prefix}h${randomUUID().slice(0, 6)}`,
    });
    const flat = await getActivityDirectory(db, { userId: user.id });
    const grouped = await getGroupedActivityDirectory(db, { userId: user.id });
    const keys = grouped.flatMap((g) => g.entries.map((e) => e.key));
    expect(keys.length).toBe(flat.length);
    expect(new Set(keys).size).toBe(flat.length);
  });
});
