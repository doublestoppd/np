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

/**
 * Feeds with a fresh idempotency key by default, so existing behavioral
 * tests exercise distinct operations; tests that care about replay pass an
 * explicit key.
 */
async function feed(
  db: PrismaClient,
  params: {
    userId: string;
    petId: string;
    itemId: string;
    now?: Date;
    idempotencyKey?: string;
  },
) {
  const { result } = await feedPet(db, {
    idempotencyKey: randomUUID(),
    ...params,
  });
  return result;
}

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
    const result = await feed(db, { userId, petId, itemId: foodId });

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
    const result = await feed(db, { userId, petId, itemId: foodId, now });

    // hunger: 50 - 4*10 = 10 after decay, + 20 restore = 30
    expect(result.hunger).toBe(50 - DECAY_PER_HOUR.hunger * 10 + 20);

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.statsUpdatedAt.getTime()).toBe(now.getTime());
  });

  it("refuses a meal the pet cannot finish, and consumes nothing", async () => {
    // 95 + 20 would overflow. The old behaviour clamped to 100 and ate the
    // item anyway, quietly destroying most of it.
    await db.pet.update({ where: { id: petId }, data: { hunger: 95 } });
    const before = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodId } },
    });

    await expectFeedError(
      feed(db, { userId, petId, itemId: foodId }),
      "PET_FULL",
    );

    const after = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodId } },
    });
    expect(after.quantity).toBe(before.quantity);
    expect(
      (await db.pet.findUniqueOrThrow({ where: { id: petId } })).hunger,
    ).toBe(95);
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(0);
  });

  it("allows a meal that lands exactly on the maximum", async () => {
    await db.pet.update({ where: { id: petId }, data: { hunger: 80 } });
    const result = await feed(db, { userId, petId, itemId: foodId });
    expect(result.hunger).toBe(100);
  });

  it("lets a full pet eat again once hunger has decayed", async () => {
    // Nothing is permanently blocked: the refusal is about right now.
    await db.pet.update({
      where: { id: petId },
      data: { hunger: 100, statsUpdatedAt: new Date() },
    });
    await expectFeedError(
      feed(db, { userId, petId, itemId: foodId }),
      "PET_FULL",
    );

    const later = new Date(Date.now() + 6 * 3_600_000);
    const result = await feed(db, { userId, petId, itemId: foodId, now: later });
    // 100 - 4*6 = 76 after decay, + 20 restore.
    expect(result.hunger).toBe(96);
  });

  it("rejects feeding a pet the user does not own, without leaking existence", async () => {
    await expectFeedError(
      feed(db, { userId: otherUserId, petId, itemId: foodId }),
      "PET_NOT_FOUND",
    );
  });

  it("rejects unknown pets", async () => {
    await expectFeedError(
      feed(db, { userId, petId: "nope", itemId: foodId }),
      "PET_NOT_FOUND",
    );
  });

  it("rejects unknown items", async () => {
    await expectFeedError(
      feed(db, { userId, petId, itemId: "nope" }),
      "ITEM_NOT_FOUND",
    );
  });

  it("rejects non-food items and leaves all state untouched", async () => {
    await db.inventoryEntry.create({
      data: { userId, itemId: toyId, quantity: 1 },
    });

    await expectFeedError(
      feed(db, { userId, petId, itemId: toyId }),
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
      feed(db, { userId, petId, itemId: foodId }),
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

  it("replays a duplicate submission instead of eating a second item", async () => {
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: foodId } },
      data: { quantity: 2 },
    });
    const key = randomUUID();

    const first = await feedPet(db, {
      userId,
      petId,
      itemId: foodId,
      idempotencyKey: key,
    });
    const second = await feedPet(db, {
      userId,
      petId,
      itemId: foodId,
      idempotencyKey: key,
    });

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);

    // Exactly one unit consumed and one ledger row written.
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodId } },
    });
    expect(entry.quantity).toBe(1);
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(1);
  });

  it("consumes one unit per distinct key when the same form is reused", async () => {
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: foodId } },
      data: { quantity: 2 },
    });

    await feed(db, { userId, petId, itemId: foodId });
    await feed(db, { userId, petId, itemId: foodId });

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodId } },
    });
    expect(entry.quantity).toBe(0);
    expect(
      await db.transaction.count({ where: { userId, type: "ITEM_USE" } }),
    ).toBe(2);
  });

  it("concurrent feedings never consume more food than they apply", async () => {
    // Four units in stock, so every request can legitimately consume one.
    // The bug this guards: all four read the same pet snapshot and the
    // later writes overwrite the earlier ones, eating four items for one
    // feeding's worth of hunger. Two concurrent requests reproduce it only
    // intermittently; four make the lost update reliable.
    const STOCK = 4;
    // Room for every feeding to land: four × 20 restore from 10 reaches 90,
    // so PET_FULL never masks the invariant under test.
    await db.pet.update({ where: { id: petId }, data: { hunger: 10 } });
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: foodId } },
      data: { quantity: STOCK },
    });
    const before = await db.pet.findUniqueOrThrow({ where: { id: petId } });

    const results = await Promise.allSettled(
      Array.from({ length: STOCK }, () =>
        feed(db, { userId, petId, itemId: foodId }),
      ),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodId } },
    });
    const consumed = STOCK - entry.quantity;
    const ledgerRows = await db.transaction.count({
      where: { userId, type: "ITEM_USE" },
    });

    // Whatever the interleaving, the books balance: one item consumed per
    // successful feeding, one ledger row each, and nothing consumed by a
    // feeding that failed.
    expect(consumed).toBe(succeeded);
    expect(ledgerRows).toBe(succeeded);

    // And the pet actually received every feeding that was paid for.
    const after = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    const restore = 20 * succeeded; // hungerRestore of the fixture food
    expect(after.hunger).toBe(before.hunger + restore);
  });

  it("never spends the same unit twice under concurrent requests", async () => {
    await db.inventoryEntry.update({
      where: { userId_itemId: { userId, itemId: foodId } },
      data: { quantity: 1 },
    });

    const results = await Promise.allSettled([
      feed(db, { userId, petId, itemId: foodId }),
      feed(db, { userId, petId, itemId: foodId }),
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
