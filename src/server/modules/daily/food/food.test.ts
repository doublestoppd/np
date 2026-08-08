/**
 * Community meal integration: one claim per day, weighted eligible
 * selection, atomic grant, and recorded-result retries.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { claimDailyMeal, FoodClaimError } from "./claim";
import { getMealView } from "./queries";
import { startOfGameDate, type GameDate } from "../game-day";

const prefix = fixturePrefix("dfood");

const YEAR = 2100 + Math.floor(Math.random() * 800);
const MONTH = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DAY_ONE: GameDate = `${YEAR}-${MONTH}-15`;
const DAY_TWO: GameDate = `${YEAR}-${MONTH}-16`;

function clockAt(gameDate: GameDate): FixedClock {
  return new FixedClock(
    new Date(startOfGameDate(gameDate).getTime() + 18 * 3_600_000),
  );
}

describe.skipIf(!testDb)("daily community meal (integration)", () => {
  const db = testDb as PrismaClient;
  const userIds: string[] = [];
  let poolSlug: string;
  let mealItemId: string;

  async function freshUser(suffix: string): Promise<string> {
    const user = await createTestUser(db, { username: `${prefix}_${suffix}` });
    userIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    poolSlug = `${prefix}-kitchen`;
    mealItemId = (
      await createTestItem(db, {
        slug: `${prefix}-stew`,
        type: "FOOD",
        hungerRestore: 20,
      })
    ).id;
    const notFood = await createTestItem(db, { slug: `${prefix}-nonfood` });
    const disabled = await createTestItem(db, {
      slug: `${prefix}-spoiled`,
      type: "FOOD",
      lifecycle: "DISABLED",
    });
    await db.dailyFoodPool.create({
      data: {
        slug: poolSlug,
        entries: {
          create: [
            { itemId: mealItemId, selectionWeight: 10 },
            // Ineligible entries with overwhelming weights — they must
            // never be selected.
            { itemId: notFood.id, selectionWeight: 100_000 },
            { itemId: disabled.id, selectionWeight: 100_000 },
          ],
        },
      },
    });
  });

  beforeEach(async () => {
    for (const id of userIds) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
  });

  afterAll(async () => {
    await db.dailyFoodClaim.deleteMany({
      where: { pool: { slug: { startsWith: prefix } } },
    });
    await db.dailyFoodPool.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("claims exactly one eligible food item, atomically with the record", async () => {
    const userId = await freshUser("claimer");
    const key = randomUUID();
    const result = await claimDailyMeal(db, {
      userId,
      poolSlug,
      idempotencyKey: key,
      clock: clockAt(DAY_ONE),
    });
    // Only the eligible FOOD item can ever be selected.
    expect(result.itemSlug).toBe(`${prefix}-stew`);
    expect(result.quantity).toBe(1);
    expect(result.alreadyClaimed).toBe(false);
    expect(result.rewardTransactionId).not.toBeNull();

    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: mealItemId } },
    });
    expect(stack.quantity).toBe(1);
    const claim = await db.dailyFoodClaim.findFirstOrThrow({
      where: { userId, gameDate: DAY_ONE },
    });
    expect(claim.awardedItemId).toBe(mealItemId);
    expect(claim.poolConfigurationVersion).toBe(1);
    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId, type: "DAILY_FOOD_CLAIM" },
    });
    expect(ledger.itemId).toBe(mealItemId);

    // Same key replays; fresh key returns the recorded claim; the item is
    // granted exactly once.
    const replay = await claimDailyMeal(db, {
      userId,
      poolSlug,
      idempotencyKey: key,
      clock: clockAt(DAY_ONE),
    });
    expect(replay.itemId).toBe(result.itemId);
    const retry = await claimDailyMeal(db, {
      userId,
      poolSlug,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    expect(retry.alreadyClaimed).toBe(true);
    expect(retry.itemId).toBe(result.itemId);
    const finalStack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: mealItemId } },
    });
    expect(finalStack.quantity).toBe(1);

    // The next game day is a fresh claim.
    const tomorrow = await claimDailyMeal(db, {
      userId,
      poolSlug,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_TWO),
    });
    expect(tomorrow.alreadyClaimed).toBe(false);
    expect(tomorrow.gameDate).toBe(DAY_TWO);
  });

  it("concurrent claims grant one item once", async () => {
    const userId = await freshUser("racer");
    const race = await runConcurrently([
      () =>
        claimDailyMeal(db, {
          userId,
          poolSlug,
          idempotencyKey: randomUUID(),
          clock: clockAt(DAY_ONE),
        }),
      () =>
        claimDailyMeal(db, {
          userId,
          poolSlug,
          idempotencyKey: randomUUID(),
          clock: clockAt(DAY_ONE),
        }),
    ]);
    expect(race.fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(
      await db.dailyFoodClaim.count({
        where: { userId, gameDate: DAY_ONE },
      }),
    ).toBe(1);
    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: mealItemId } },
    });
    expect(stack.quantity).toBe(1);
    expect(
      await db.transaction.count({ where: { userId, type: "DAILY_FOOD_CLAIM" } }),
    ).toBe(1);
  });

  it("a pool without eligible entries is unavailable", async () => {
    const empty = `${prefix}-empty`;
    const nonfood = await db.item.findUniqueOrThrow({
      where: { slug: `${prefix}-nonfood` },
    });
    await db.dailyFoodPool.create({
      data: {
        slug: empty,
        entries: { create: [{ itemId: nonfood.id, selectionWeight: 10 }] },
      },
    });
    await expect(
      claimDailyMeal(db, {
        userId: await freshUser("hungry"),
        poolSlug: empty,
        idempotencyKey: randomUUID(),
        clock: clockAt(DAY_ONE),
      }),
    ).rejects.toThrowError(FoodClaimError);
  });

  it("the meal view reports availability and the recorded claim", async () => {
    const userId = await freshUser("viewer");
    let view = await getMealView(db, {
      userId,
      gameDate: DAY_ONE,
      poolSlug,
    });
    expect(view.available).toBe(true);
    expect(view.todaysClaim).toBeNull();
    await claimDailyMeal(db, {
      userId,
      poolSlug,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    view = await getMealView(db, { userId, gameDate: DAY_ONE, poolSlug });
    expect(view.todaysClaim?.itemName).toBeTruthy();
    expect(view.todaysClaim?.quantity).toBe(1);
  });
});

describe.skipIf(!testDb)("two daily pools, claimed independently", () => {
  const db = testDb as PrismaClient;

  it("lets a player claim the meal and the drink on the same day", async () => {
    // The claim row used to be unique on (userId, gameDate), so adding a
    // second pool would have made the two dailies silently exclude each
    // other: have lunch, and the free hot drink reports itself taken.
    const userId = (
      await createTestUser(db, { username: `${prefix}_two${Date.now() % 100000}` })
    ).id;
    const drinkItem = await createTestItem(db, {
      slug: `${prefix}-brew`,
      type: "FOOD",
      hungerRestore: 5,
    });
    const drinkPool = await db.dailyFoodPool.create({
      data: {
        slug: `${prefix}-hut`,
        entries: { create: [{ itemId: drinkItem.id, selectionWeight: 10 }] },
      },
    });

    const mealItem = await createTestItem(db, {
      slug: `${prefix}-lunch`,
      type: "FOOD",
      hungerRestore: 8,
    });
    const mealPool = await db.dailyFoodPool.create({
      data: {
        slug: `${prefix}-canteen`,
        entries: { create: [{ itemId: mealItem.id, selectionWeight: 10 }] },
      },
    });

    const meal = await claimDailyMeal(db, {
      userId,
      poolSlug: mealPool.slug,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    const drink = await claimDailyMeal(db, {
      userId,
      poolSlug: drinkPool.slug,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });

    expect(meal.alreadyClaimed).toBe(false);
    expect(drink.alreadyClaimed).toBe(false);
    expect(drink.itemSlug).toBe(`${prefix}-brew`);
    expect(
      await db.dailyFoodClaim.count({ where: { userId, gameDate: DAY_ONE } }),
    ).toBe(2);

    // ...and each is still once-a-day on its own.
    const again = await claimDailyMeal(db, {
      userId,
      poolSlug: drinkPool.slug,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    expect(again.alreadyClaimed).toBe(true);
    expect(again.itemSlug).toBe(drink.itemSlug);
    expect(
      await db.dailyFoodClaim.count({ where: { userId, gameDate: DAY_ONE } }),
    ).toBe(2);
  });
});
