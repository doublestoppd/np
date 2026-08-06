/**
 * Integration tests for the feed-pet economy operation. They run against a
 * real PostgreSQL database (TEST_DATABASE_URL, falling back to DATABASE_URL)
 * with migrations applied, and are skipped when neither is configured.
 * See README.md for setup.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { feedPet, FeedError } from "./feed-pet";
import { DECAY_PER_HOUR } from "./pet-stats";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

const prisma = databaseUrl
  ? new PrismaClient({ datasourceUrl: databaseUrl })
  : null;

async function expectFeedError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(FeedError);
  expect((error as FeedError).code).toBe(code);
}

describe.skipIf(!prisma)("feedPet (integration)", () => {
  // Non-null in every test because of skipIf.
  const db = prisma as PrismaClient;

  let userId: string;
  let otherUserId: string;
  let petId: string;
  let foodId: string;
  let toyId: string;

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 12);
    const user = await db.user.create({
      data: { username: `feed_test_${suffix}`, normalizedUsername: `feed_test_${suffix}`, passwordHash: "x" },
    });
    userId = user.id;
    const otherUser = await db.user.create({
      data: { username: `feed_other_${suffix}`, normalizedUsername: `feed_other_${suffix}`, passwordHash: "x" },
    });
    otherUserId = otherUser.id;

    const species = await db.petSpecies.upsert({
      where: { slug: "test-species" },
      create: {
        slug: "test-species",
        name: "Test Species",
        description: "Test only",
        artKey: "test",
      },
      update: {},
    });

    const pet = await db.pet.create({
      data: {
        name: "Testling",
        ownerId: userId,
        speciesId: species.id,
        hunger: 50,
        happiness: 70,
        energy: 70,
        health: 90,
        statsUpdatedAt: new Date(),
      },
    });
    petId = pet.id;

    const food = await db.item.create({
      data: {
        slug: `test-food-${suffix}`,
        name: "Test Snack",
        description: "Test only",
        type: "FOOD",
        artKey: `test-food-${suffix}`,
        price: 10,
        hungerRestore: 20,
      },
    });
    foodId = food.id;

    const toy = await db.item.create({
      data: {
        slug: `test-toy-${suffix}`,
        name: "Test Toy",
        description: "Test only",
        type: "TOY",
        artKey: `test-toy-${suffix}`,
        price: 10,
        happinessBoost: 10,
      },
    });
    toyId = toy.id;

    await db.inventoryEntry.create({
      data: { userId, itemId: foodId, quantity: 2 },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    // The ledger blocks cascading user deletion (Restrict) by design, so
    // test cleanup removes transactions explicitly first.
    await prisma.transaction.deleteMany({
      where: { user: { username: { startsWith: "feed_" } } },
    });
    await prisma.user.deleteMany({
      where: { username: { startsWith: "feed_" } },
    });
    await prisma.item.deleteMany({ where: { slug: { startsWith: "test-" } } });
    await prisma.petSpecies.deleteMany({ where: { slug: "test-species" } });
    await prisma.$disconnect();
  });

  it("feeds the pet: restores hunger, consumes the item, records a transaction", async () => {
    const result = await feedPet(db, { userId, petId, itemId: foodId });

    expect(result.hunger).toBe(70); // 50 + 20, no meaningful decay elapsed

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.hunger).toBe(70);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodId } },
    });
    expect(entry.quantity).toBe(1);

    const transactions = await db.transaction.findMany({
      where: { userId, type: "ITEM_USE" },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.itemId).toBe(foodId);
    expect(transactions[0]?.petId).toBe(petId);
    expect(transactions[0]?.quantity).toBe(1);
  });

  it("applies timestamp decay before adding the food's restore value", async () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 3_600_000);
    await db.pet.update({
      where: { id: petId },
      data: { statsUpdatedAt: tenHoursAgo },
    });

    const now = new Date();
    const result = await feedPet(db, { userId, petId, itemId: foodId, now });

    // hunger: 50 - 4*10 = 10 after decay, + 20 restore = 30
    expect(result.hunger).toBe(50 - DECAY_PER_HOUR.hunger * 10 + 20);

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.statsUpdatedAt.getTime()).toBe(now.getTime());
  });

  it("clamps hunger at 100 when overfeeding", async () => {
    await db.pet.update({ where: { id: petId }, data: { hunger: 95 } });
    const result = await feedPet(db, { userId, petId, itemId: foodId });
    expect(result.hunger).toBe(100);
  });

  it("rejects feeding a pet the user does not own, without leaking existence", async () => {
    await expectFeedError(
      feedPet(db, { userId: otherUserId, petId, itemId: foodId }),
      "PET_NOT_FOUND",
    );
  });

  it("rejects unknown pets", async () => {
    await expectFeedError(
      feedPet(db, { userId, petId: "nope", itemId: foodId }),
      "PET_NOT_FOUND",
    );
  });

  it("rejects unknown items", async () => {
    await expectFeedError(
      feedPet(db, { userId, petId, itemId: "nope" }),
      "ITEM_NOT_FOUND",
    );
  });

  it("rejects non-food items and leaves all state untouched", async () => {
    await db.inventoryEntry.create({
      data: { userId, itemId: toyId, quantity: 1 },
    });

    await expectFeedError(
      feedPet(db, { userId, petId, itemId: toyId }),
      "NOT_FOOD",
    );

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: toyId } },
    });
    expect(entry.quantity).toBe(1);
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(0);
  });

  it("rejects feeding without inventory and rolls back atomically", async () => {
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: foodId } },
      data: { quantity: 0 },
    });
    const before = await db.pet.findUniqueOrThrow({ where: { id: petId } });

    await expectFeedError(
      feedPet(db, { userId, petId, itemId: foodId }),
      "NO_ITEM_IN_INVENTORY",
    );

    const after = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(after.hunger).toBe(before.hunger);
    expect(after.statsUpdatedAt.getTime()).toBe(
      before.statsUpdatedAt.getTime(),
    );
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(0);
  });

  it("never spends the same unit twice under concurrent requests", async () => {
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: foodId } },
      data: { quantity: 1 },
    });

    const results = await Promise.allSettled([
      feedPet(db, { userId, petId, itemId: foodId }),
      feedPet(db, { userId, petId, itemId: foodId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodId } },
    });
    expect(entry.quantity).toBe(0);
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(1);
  });
});
