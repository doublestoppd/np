/**
 * Integration tests for the data-driven item model and the database-level
 * safeguards added in the phase1_foundation migration (ADR-1, ADR-2).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { fixturePrefix, testDb } from "./test-db";

const prefix = fixturePrefix("items");

describe.skipIf(!testDb)("item model (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: { username: `${prefix}_user`, passwordHash: "x" },
    });
    userId = user.id;

    await db.itemCategory.create({
      data: { slug: `${prefix}-oddments`, name: "Oddments", sortOrder: 5 },
    });
    await db.itemTag.createMany({
      data: [
        { slug: `${prefix}-glossy`, name: "Glossy" },
        { slug: `${prefix}-round`, name: "Round" },
      ],
    });
    await db.item.create({
      data: {
        slug: `${prefix}-marble`,
        name: "Fixture Marble",
        description: "A test marble.",
        type: null,
        artKey: `${prefix}-marble`,
        price: 3,
        category: { connect: { slug: `${prefix}-oddments` } },
        tags: {
          connect: [{ slug: `${prefix}-glossy` }, { slug: `${prefix}-round` }],
        },
      },
    });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.itemCategory.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await db.itemTag.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("loads an item with its category and tags", async () => {
    const item = await db.item.findUniqueOrThrow({
      where: { slug: `${prefix}-marble` },
      include: { category: true, tags: true },
    });
    expect(item.type).toBeNull();
    expect(item.category?.name).toBe("Oddments");
    expect(item.tags.map((tag) => tag.name).sort()).toEqual([
      "Glossy",
      "Round",
    ]);
  });

  it("supports adding a new category without touching the ItemType enum", async () => {
    const category = await db.itemCategory.create({
      data: { slug: `${prefix}-instruments`, name: "Instruments" },
    });
    const item = await db.item.create({
      data: {
        slug: `${prefix}-hum-whistle`,
        name: "Hum Whistle",
        description: "Hums when whistled at.",
        type: null,
        artKey: `${prefix}-hum-whistle`,
        price: 8,
        categoryId: category.id,
      },
    });
    expect(item.type).toBeNull();
    expect(item.categoryId).toBe(category.id);
  });

  it("rejects negative item prices at the database level", async () => {
    await expect(
      db.item.create({
        data: {
          slug: `${prefix}-cursed`,
          name: "Cursed Bargain",
          description: "Should never exist.",
          artKey: `${prefix}-cursed`,
          price: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects negative inventory quantities at the database level", async () => {
    const item = await db.item.findUniqueOrThrow({
      where: { slug: `${prefix}-marble` },
    });
    await expect(
      db.inventoryEntry.create({
        data: { userId, itemId: item.id, quantity: -2 },
      }),
    ).rejects.toThrow();
  });

  it("rejects negative showcase positions at the database level", async () => {
    const item = await db.item.findUniqueOrThrow({
      where: { slug: `${prefix}-marble` },
    });
    await expect(
      db.showcaseEntry.create({
        data: { userId, itemId: item.id, position: -1 },
      }),
    ).rejects.toThrow();
  });
});
