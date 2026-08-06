/** Integration tests for hybrid ownership and relational provenance. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  escrowInstance,
  grantItem,
  removeItem,
  transferEscrowedInstance,
} from "./ownership";
import { listProvenance } from "./provenance";
import { EconomyError } from "@/server/modules/commerce/errors";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("own");

describe.skipIf(!testDb)("ownership (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let otherUserId: string;
  let stackableId: string;
  let noneItemId: string;
  let origItemId: string;
  let fullItemId: string;

  beforeAll(async () => {
    userId = (await createTestUser(db, { username: `${prefix}_a` })).id;
    otherUserId = (await createTestUser(db, { username: `${prefix}_b` })).id;
    stackableId = (await createTestItem(db, { slug: `${prefix}-stack` })).id;
    noneItemId = (
      await createTestItem(db, { slug: `${prefix}-inst-none`, stackable: false })
    ).id;
    origItemId = (
      await createTestItem(db, {
        slug: `${prefix}-inst-orig`,
        stackable: false,
        provenancePolicy: "ORIGINAL_SOURCE",
      })
    ).id;
    fullItemId = (
      await createTestItem(db, {
        slug: `${prefix}-inst-full`,
        stackable: false,
        provenancePolicy: "FULL_HISTORY",
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("creates and increments stackable inventory", async () => {
    await db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({ where: { id: stackableId } });
      await grantItem(tx, { userId, item, quantity: 3, source: "test" });
      await grantItem(tx, { userId, item, quantity: 2, source: "test" });
    });
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: stackableId } },
    });
    expect(entry.quantity).toBe(5);
  });

  it("rejects excessive or invalid removal", async () => {
    await expect(
      db.$transaction((tx) => removeItem(tx, { userId, itemId: stackableId, quantity: 999 })),
    ).rejects.toThrowError(EconomyError);
    await expect(
      db.$transaction((tx) => removeItem(tx, { userId, itemId: stackableId, quantity: -1 })),
    ).rejects.toThrowError(EconomyError);
  });

  it("writes provenance events per policy: NONE none, ORIGINAL_SOURCE creation only", async () => {
    await db.$transaction(async (tx) => {
      const none = await tx.item.findUniqueOrThrow({ where: { id: noneItemId } });
      const orig = await tx.item.findUniqueOrThrow({ where: { id: origItemId } });
      await grantItem(tx, { userId, item: none, quantity: 1, source: "npc-shop:test" });
      await grantItem(tx, { userId, item: orig, quantity: 1, source: "npc-shop:test" });
    });

    const noneInstance = await db.itemInstance.findFirstOrThrow({
      where: { itemId: noneItemId, ownerId: userId },
    });
    expect(
      await db.itemProvenanceEvent.count({
        where: { itemInstanceId: noneInstance.id },
      }),
    ).toBe(0);

    const origInstance = await db.itemInstance.findFirstOrThrow({
      where: { itemId: origItemId, ownerId: userId },
    });
    const { events } = await listProvenance(db, origInstance.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("created");
  });

  it("FULL_HISTORY transfers append events linked to escrow lifecycle", async () => {
    const instanceId = await db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({ where: { id: fullItemId } });
      const granted = await grantItem(tx, {
        userId,
        item,
        quantity: 1,
        source: "npc-shop:test",
      });
      return granted.instanceIds[0] as string;
    });

    await db.$transaction((tx) => escrowInstance(tx, { userId, instanceId }));
    await expect(
      db.$transaction((tx) => escrowInstance(tx, { userId, instanceId })),
    ).rejects.toThrowError(EconomyError);

    await db.$transaction((tx) =>
      transferEscrowedInstance(tx, {
        instanceId,
        fromUserId: userId,
        toUserId: otherUserId,
        note: "Sold via test",
        sourceType: "player-shop:test",
      }),
    );
    const transferred = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(transferred.ownerId).toBe(otherUserId);
    expect(transferred.status).toBe("OWNED");

    const { events } = await listProvenance(db, instanceId);
    // Newest first.
    expect(events.map((event) => event.eventType)).toEqual([
      "transferred",
      "created",
    ]);
    expect(events[0]?.toUsername).toBe(`${prefix}_b`);
  });

  it("ORIGINAL_SOURCE transfers do not accumulate transfer history", async () => {
    const instance = await db.itemInstance.findFirstOrThrow({
      where: { itemId: origItemId, ownerId: userId },
    });
    await db.$transaction((tx) => escrowInstance(tx, { userId, instanceId: instance.id }));
    await db.$transaction((tx) =>
      transferEscrowedInstance(tx, {
        instanceId: instance.id,
        fromUserId: userId,
        toUserId: otherUserId,
        note: "Sold via test",
        sourceType: "player-shop:test",
      }),
    );
    const { events } = await listProvenance(db, instance.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("created");
  });
});
