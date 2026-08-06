/** Instance-aware showcase tests: both modes, validation, stale handling. */
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
import { grantItem } from "@/server/modules/items/ownership";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems, giveStack } from "@test/factories/items";

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
  let stackIds: string[] = [];
  let instancedItemId: string;
  let ownInstanceId: string;
  let strangerInstanceId: string;

  beforeAll(async () => {
    userId = (await createTestUser(db, { username: `${prefix}_user` })).id;
    strangerId = (await createTestUser(db, { username: `${prefix}_str` })).id;
    stackIds = [];
    for (let i = 0; i < SHOWCASE_MAX + 1; i++) {
      const item = await createTestItem(db, { slug: `${prefix}-item-${i}` });
      stackIds.push(item.id);
    }
    const relic = await createTestItem(db, {
      slug: `${prefix}-relic`,
      stackable: false,
      provenancePolicy: "FULL_HISTORY",
    });
    instancedItemId = relic.id;
    [ownInstanceId, strangerInstanceId] = await db.$transaction(async (tx) => {
      const mine = await grantItem(tx, {
        userId,
        item: relic,
        quantity: 1,
        source: "test",
      });
      const theirs = await grantItem(tx, {
        userId: strangerId,
        item: relic,
        quantity: 1,
        source: "test",
      });
      return [mine.instanceIds[0] as string, theirs.instanceIds[0] as string];
    });
  });

  beforeEach(async () => {
    await db.showcaseEntry.deleteMany({
      where: { userId: { in: [userId, strangerId] } },
    });
    for (const itemId of stackIds) {
      await giveStack(db, { userId, itemId, quantity: 1 });
    }
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("showcases stackable items by definition while owned", async () => {
    await addShowcaseItem(db, { userId, itemId: stackIds[0] as string });
    await addShowcaseItem(db, { userId, itemId: stackIds[1] as string });
    const entries = await listShowcase(db, userId);
    expect(entries.map((entry) => entry.itemId)).toEqual([stackIds[0], stackIds[1]]);
    expect(entries.every((entry) => entry.itemInstanceId === null)).toBe(true);
  });

  it("showcases instanced items by specific OWNED instance", async () => {
    await addShowcaseItem(db, {
      userId,
      itemId: instancedItemId,
      itemInstanceId: ownInstanceId,
    });
    const entries = await listShowcase(db, userId);
    expect(entries[0]?.itemInstanceId).toBe(ownInstanceId);
  });

  it("rejects ambiguous or invalid references", async () => {
    // Stackable items must not carry an instance reference.
    await expectShowcaseError(
      addShowcaseItem(db, {
        userId,
        itemId: stackIds[0] as string,
        itemInstanceId: ownInstanceId,
      }),
      "INVALID_REFERENCE",
    );
    // Instanced items require a specific instance.
    await expectShowcaseError(
      addShowcaseItem(db, { userId, itemId: instancedItemId }),
      "INVALID_REFERENCE",
    );
    // Someone else's instance is not yours to display.
    await expectShowcaseError(
      addShowcaseItem(db, {
        userId,
        itemId: instancedItemId,
        itemInstanceId: strangerInstanceId,
      }),
      "ITEM_NOT_OWNED",
    );
    // Unowned stack.
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: stackIds[2] as string } },
      data: { quantity: 0 },
    });
    await expectShowcaseError(
      addShowcaseItem(db, { userId, itemId: stackIds[2] as string }),
      "ITEM_NOT_OWNED",
    );
  });

  it("enforces the slot bound, ordering, and removal", async () => {
    for (let i = 0; i < SHOWCASE_MAX; i++) {
      await addShowcaseItem(db, { userId, itemId: stackIds[i] as string });
    }
    await expectShowcaseError(
      addShowcaseItem(db, { userId, itemId: stackIds[SHOWCASE_MAX] as string }),
      "SHOWCASE_FULL",
    );
    await moveShowcaseItem(db, {
      userId,
      itemId: stackIds[2] as string,
      direction: "up",
    });
    let entries = await listShowcase(db, userId);
    expect(entries.map((entry) => entry.itemId).slice(0, 3)).toEqual([
      stackIds[0],
      stackIds[2],
      stackIds[1],
    ]);
    await removeShowcaseItem(db, { userId, itemId: stackIds[0] as string });
    entries = await listShowcase(db, userId);
    expect(entries.map((entry) => entry.itemId)[0]).toBe(stackIds[2]);
  });

  it("hides entries when ownership, escrow, or item lifecycle invalidates them", async () => {
    await addShowcaseItem(db, { userId, itemId: stackIds[0] as string });
    await addShowcaseItem(db, {
      userId,
      itemId: instancedItemId,
      itemInstanceId: ownInstanceId,
    });

    // Consuming the last stack copy hides the stack entry.
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: stackIds[0] as string } },
      data: { quantity: 0 },
    });
    // Escrowing the instance hides the instance entry.
    await db.itemInstance.update({
      where: { id: ownInstanceId },
      data: { status: "ESCROWED" },
    });
    expect(await listShowcase(db, userId)).toHaveLength(0);

    // Restore instance; disabling the item hides it again.
    await db.itemInstance.update({
      where: { id: ownInstanceId },
      data: { status: "OWNED" },
    });
    await db.item.update({
      where: { id: instancedItemId },
      data: { lifecycle: "DISABLED" },
    });
    try {
      expect(await listShowcase(db, userId)).toHaveLength(0);
    } finally {
      await db.item.update({
        where: { id: instancedItemId },
        data: { lifecycle: "ACTIVE" },
      });
    }
  });
});
