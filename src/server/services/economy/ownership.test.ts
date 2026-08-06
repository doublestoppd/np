/** Integration tests for hybrid item ownership and provenance policies. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  escrowInstance,
  grantItem,
  removeItem,
  transferEscrowedInstance,
} from "./ownership";
import { EconomyError } from "./errors";
import { fixturePrefix, testDb } from "../test-db";

const prefix = fixturePrefix("own");

describe.skipIf(!testDb)("ownership (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let otherUserId: string;
  let stackableId: string;
  let noneItem: { id: string };
  let originalSourceItem: { id: string };
  let fullHistoryItem: { id: string };

  beforeAll(async () => {
    userId = (
      await db.user.create({
        data: { username: `${prefix}_a`, passwordHash: "x" },
      })
    ).id;
    otherUserId = (
      await db.user.create({
        data: { username: `${prefix}_b`, passwordHash: "x" },
      })
    ).id;

    stackableId = (
      await db.item.create({
        data: {
          slug: `${prefix}-stack`,
          name: "Stack",
          description: "",
          artKey: "s",
          price: 1,
        },
      })
    ).id;
    noneItem = await db.item.create({
      data: {
        slug: `${prefix}-inst-none`,
        name: "Instance None",
        description: "",
        artKey: "i",
        price: 1,
        stackable: false,
        provenancePolicy: "NONE",
      },
    });
    originalSourceItem = await db.item.create({
      data: {
        slug: `${prefix}-inst-orig`,
        name: "Instance Orig",
        description: "",
        artKey: "i",
        price: 1,
        stackable: false,
        provenancePolicy: "ORIGINAL_SOURCE",
      },
    });
    fullHistoryItem = await db.item.create({
      data: {
        slug: `${prefix}-inst-full`,
        name: "Instance Full",
        description: "",
        artKey: "i",
        price: 1,
        stackable: false,
        provenancePolicy: "FULL_HISTORY",
      },
    });
  });

  afterAll(async () => {
    await db.itemInstance.deleteMany({
      where: { item: { slug: { startsWith: prefix } } },
    });
    await db.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
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
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: stackableId } },
    });
    expect(entry.quantity).toBe(5);
  });

  it("creates instances for non-stackable items with policy-shaped provenance", async () => {
    await db.$transaction(async (tx) => {
      const none = await tx.item.findUniqueOrThrow({ where: { id: noneItem.id } });
      const orig = await tx.item.findUniqueOrThrow({
        where: { id: originalSourceItem.id },
      });
      await grantItem(tx, { userId, item: none, quantity: 1, source: "npc-shop:test" });
      await grantItem(tx, { userId, item: orig, quantity: 1, source: "npc-shop:test" });
    });

    const noneInstance = await db.itemInstance.findFirstOrThrow({
      where: { itemId: noneItem.id, ownerId: userId },
    });
    expect(noneInstance.provenance).toEqual([]);
    expect(noneInstance.acquisitionSource).toBe("npc-shop:test");

    const origInstance = await db.itemInstance.findFirstOrThrow({
      where: { itemId: originalSourceItem.id, ownerId: userId },
    });
    const origEvents = origInstance.provenance as Array<{ type: string }>;
    expect(origEvents).toHaveLength(1);
    expect(origEvents[0]?.type).toBe("acquired");
  });

  it("transfers an escrowed instance and appends FULL_HISTORY provenance", async () => {
    const instanceId = await db.$transaction(async (tx) => {
      const item = await tx.item.findUniqueOrThrow({
        where: { id: fullHistoryItem.id },
      });
      const granted = await grantItem(tx, {
        userId,
        item,
        quantity: 1,
        source: "npc-shop:test",
      });
      return granted.instanceIds[0] as string;
    });

    await db.$transaction((tx) => escrowInstance(tx, { userId, instanceId }));
    const escrowed = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(escrowed.status).toBe("ESCROWED");

    // Escrowed instances cannot be escrowed/listed again.
    await expect(
      db.$transaction((tx) => escrowInstance(tx, { userId, instanceId })),
    ).rejects.toThrowError(EconomyError);

    await db.$transaction((tx) =>
      transferEscrowedInstance(tx, {
        instanceId,
        fromUserId: userId,
        toUserId: otherUserId,
        note: "Sold via test",
      }),
    );
    const transferred = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    expect(transferred.ownerId).toBe(otherUserId);
    expect(transferred.status).toBe("OWNED");
    const events = transferred.provenance as Array<{ type: string; note: string }>;
    expect(events.map((event) => event.type)).toEqual(["acquired", "transferred"]);
  });

  it("ORIGINAL_SOURCE transfers do not accumulate transfer history", async () => {
    const instanceId = (
      await db.itemInstance.findFirstOrThrow({
        where: { itemId: originalSourceItem.id, ownerId: userId },
      })
    ).id;
    await db.$transaction((tx) => escrowInstance(tx, { userId, instanceId }));
    await db.$transaction((tx) =>
      transferEscrowedInstance(tx, {
        instanceId,
        fromUserId: userId,
        toUserId: otherUserId,
        note: "Sold via test",
      }),
    );
    const instance = await db.itemInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });
    const events = instance.provenance as Array<{ type: string }>;
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("acquired");
  });
});
