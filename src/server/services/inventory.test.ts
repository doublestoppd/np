/** Integration tests for inventory search, filtering, and sorting. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { listInventory } from "./inventory";
import { fixturePrefix, testDb } from "./test-db";

const prefix = fixturePrefix("inv");

describe.skipIf(!testDb)("listInventory (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: { username: `${prefix}_user`, passwordHash: "x" },
    });
    userId = user.id;

    const snacks = await db.itemCategory.create({
      data: { slug: `${prefix}-snacks`, name: "Snacks" },
    });
    const shinies = await db.itemCategory.create({
      data: { slug: `${prefix}-shinies`, name: "Shinies" },
    });

    const definitions = [
      {
        slug: `${prefix}-bramble-bun`,
        name: "Bramble Bun",
        description: "A bun with brambles in it.",
        categoryId: snacks.id,
        price: 10,
        quantity: 5,
      },
      {
        slug: `${prefix}-amber-drop`,
        name: "Amber Drop",
        description: "A drop of old tree light.",
        categoryId: shinies.id,
        price: 40,
        quantity: 1,
      },
      {
        slug: `${prefix}-copper-coil`,
        name: "Copper Coil",
        description: "Coiled copper, pleasingly springy.",
        categoryId: shinies.id,
        price: 25,
        quantity: 3,
      },
      {
        slug: `${prefix}-zero-item`,
        name: "Zero Item",
        description: "Owned zero times; must never appear.",
        categoryId: snacks.id,
        price: 99,
        quantity: 0,
      },
    ];

    for (const def of definitions) {
      const item = await db.item.create({
        data: {
          slug: def.slug,
          name: def.name,
          description: def.description,
          artKey: def.slug,
          price: def.price,
          categoryId: def.categoryId,
        },
      });
      await db.inventoryEntry.create({
        data: { userId, itemId: item.id, quantity: def.quantity },
      });
    }
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { username: { startsWith: prefix } } });
    await db.item.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.itemCategory.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await db.$disconnect();
  });

  it("lists only owned items (quantity > 0), sorted by name by default", async () => {
    const entries = await listInventory(db, userId);
    expect(entries.map((entry) => entry.item.name)).toEqual([
      "Amber Drop",
      "Bramble Bun",
      "Copper Coil",
    ]);
  });

  it("searches name and description case-insensitively", async () => {
    const byName = await listInventory(db, userId, { search: "bramble" });
    expect(byName.map((entry) => entry.item.name)).toEqual(["Bramble Bun"]);

    const byDescription = await listInventory(db, userId, {
      search: "TREE LIGHT",
    });
    expect(byDescription.map((entry) => entry.item.name)).toEqual([
      "Amber Drop",
    ]);
  });

  it("filters by category slug", async () => {
    const shinies = await listInventory(db, userId, {
      category: `${prefix}-shinies`,
    });
    expect(shinies.map((entry) => entry.item.name)).toEqual([
      "Amber Drop",
      "Copper Coil",
    ]);
  });

  it("sorts by quantity descending", async () => {
    const entries = await listInventory(db, userId, { sort: "quantity" });
    expect(entries.map((entry) => entry.quantity)).toEqual([5, 3, 1]);
  });

  it("sorts by value descending", async () => {
    const entries = await listInventory(db, userId, { sort: "value" });
    expect(entries.map((entry) => entry.item.price)).toEqual([40, 25, 10]);
  });

  it("combines search, category, and sort", async () => {
    const entries = await listInventory(db, userId, {
      search: "co",
      category: `${prefix}-shinies`,
      sort: "value",
    });
    expect(entries.map((entry) => entry.item.name)).toEqual(["Copper Coil"]);
  });
});
