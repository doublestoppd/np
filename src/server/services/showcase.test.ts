/** Integration tests for the player-controlled showcase. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  addShowcaseItem,
  listShowcase,
  moveShowcaseItem,
  removeShowcaseItem,
  ShowcaseError,
  SHOWCASE_MAX,
} from "./showcase";
import { fixturePrefix, testDb } from "./test-db";

const prefix = fixturePrefix("show");

async function expectShowcaseError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ShowcaseError);
  expect((error as ShowcaseError).code).toBe(code);
}

describe.skipIf(!testDb)("showcase (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let strangerId: string;
  /** Item ids owned by the user (quantity 1 each). */
  let itemIds: string[] = [];
  /** An item that exists but the user does not own. */
  let unownedItemId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: { username: `${prefix}_user`, passwordHash: "x" },
    });
    userId = user.id;
    const stranger = await db.user.create({
      data: { username: `${prefix}_stranger`, passwordHash: "x" },
    });
    strangerId = stranger.id;

    itemIds = [];
    for (let i = 0; i < SHOWCASE_MAX + 1; i++) {
      const item = await db.item.create({
        data: {
          slug: `${prefix}-item-${i}`,
          name: `Fixture Item ${i}`,
          description: "Test only",
          artKey: `${prefix}-item-${i}`,
          price: 1,
        },
      });
      itemIds.push(item.id);
      await db.inventoryEntry.create({
        data: { userId, itemId: item.id, quantity: 1 },
      });
    }

    const unowned = await db.item.create({
      data: {
        slug: `${prefix}-unowned`,
        name: "Unowned Item",
        description: "Test only",
        artKey: `${prefix}-unowned`,
        price: 1,
      },
    });
    unownedItemId = unowned.id;
    // The stranger owns it; our user does not.
    await db.inventoryEntry.create({
      data: { userId: strangerId, itemId: unowned.id, quantity: 1 },
    });
  });

  beforeEach(async () => {
    await db.showcaseEntry.deleteMany({
      where: { userId: { in: [userId, strangerId] } },
    });
    // Restore quantities consumed by stale-ownership tests.
    await db.inventoryEntry.updateMany({
      where: { userId },
      data: { quantity: 1 },
    });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  async function ids(): Promise<string[]> {
    const entries = await listShowcase(db, userId);
    return entries.map((entry) => entry.itemId);
  }

  it("adds owned items in order", async () => {
    await addShowcaseItem(db, { userId, itemId: itemIds[0] as string });
    await addShowcaseItem(db, { userId, itemId: itemIds[1] as string });
    expect(await ids()).toEqual([itemIds[0], itemIds[1]]);
  });

  it("rejects showcasing an item the player does not own", async () => {
    await expectShowcaseError(
      addShowcaseItem(db, { userId, itemId: unownedItemId }),
      "ITEM_NOT_OWNED",
    );
    expect(await ids()).toEqual([]);
  });

  it("rejects duplicates", async () => {
    await addShowcaseItem(db, { userId, itemId: itemIds[0] as string });
    await expectShowcaseError(
      addShowcaseItem(db, { userId, itemId: itemIds[0] as string }),
      "ALREADY_SHOWCASED",
    );
  });

  it("enforces the slot bound", async () => {
    for (let i = 0; i < SHOWCASE_MAX; i++) {
      await addShowcaseItem(db, { userId, itemId: itemIds[i] as string });
    }
    await expectShowcaseError(
      addShowcaseItem(db, { userId, itemId: itemIds[SHOWCASE_MAX] as string }),
      "SHOWCASE_FULL",
    );
    expect((await ids()).length).toBe(SHOWCASE_MAX);
  });

  it("removes entries and renumbers the rest", async () => {
    for (let i = 0; i < 3; i++) {
      await addShowcaseItem(db, { userId, itemId: itemIds[i] as string });
    }
    await removeShowcaseItem(db, { userId, itemId: itemIds[1] as string });
    expect(await ids()).toEqual([itemIds[0], itemIds[2]]);

    const entries = await db.showcaseEntry.findMany({
      where: { userId },
      orderBy: { position: "asc" },
    });
    expect(entries.map((entry) => entry.position)).toEqual([0, 1]);
  });

  it("rejects removing something not on display", async () => {
    await expectShowcaseError(
      removeShowcaseItem(db, { userId, itemId: itemIds[0] as string }),
      "ENTRY_NOT_FOUND",
    );
  });

  it("moves entries up and down; moving past the ends is a no-op", async () => {
    for (let i = 0; i < 3; i++) {
      await addShowcaseItem(db, { userId, itemId: itemIds[i] as string });
    }
    await moveShowcaseItem(db, {
      userId,
      itemId: itemIds[2] as string,
      direction: "up",
    });
    expect(await ids()).toEqual([itemIds[0], itemIds[2], itemIds[1]]);

    await moveShowcaseItem(db, {
      userId,
      itemId: itemIds[0] as string,
      direction: "up",
    });
    expect(await ids()).toEqual([itemIds[0], itemIds[2], itemIds[1]]);

    await moveShowcaseItem(db, {
      userId,
      itemId: itemIds[1] as string,
      direction: "down",
    });
    expect(await ids()).toEqual([itemIds[0], itemIds[2], itemIds[1]]);
  });

  it("hides entries whose owned quantity has dropped to zero", async () => {
    await addShowcaseItem(db, { userId, itemId: itemIds[0] as string });
    await addShowcaseItem(db, { userId, itemId: itemIds[1] as string });

    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: itemIds[0] as string } },
      data: { quantity: 0 },
    });

    expect(await ids()).toEqual([itemIds[1]]);
  });

  it("prunes stale entries on the next edit", async () => {
    await addShowcaseItem(db, { userId, itemId: itemIds[0] as string });
    await addShowcaseItem(db, { userId, itemId: itemIds[1] as string });
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: itemIds[0] as string } },
      data: { quantity: 0 },
    });

    // Any edit rewrites the showcase without the stale entry.
    await addShowcaseItem(db, { userId, itemId: itemIds[2] as string });

    const rows = await db.showcaseEntry.findMany({
      where: { userId },
      orderBy: { position: "asc" },
    });
    expect(rows.map((row) => row.itemId)).toEqual([itemIds[1], itemIds[2]]);
    expect(rows.map((row) => row.position)).toEqual([0, 1]);
  });
});
