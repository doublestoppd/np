/**
 * Fault-injection matrix for the daily activities: when any step of a
 * reward transaction fails, the database is exactly as before — no result
 * row, no ledger row, no wallet or inventory change — and a clean retry
 * succeeds. (Audit events are recorded AFTER the commit, best-effort, per
 * the repository's critical-versus-best-effort policy.)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { withFault, InjectedFault } from "@test/helpers/fault-injection";
import { FixedClock } from "@test/helpers/clock";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { submitGuess } from "./word/game";
import { spinWheel } from "./wheel/spin";
import { claimDailyMeal } from "./food/claim";
import { startOfGameDate, type GameDate } from "./game-day";

const prefix = fixturePrefix("droll");

const YEAR = 2100 + Math.floor(Math.random() * 800);
const MONTH = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const GAME_DATE: GameDate = `${YEAR}-${MONTH}-20`;

const clock = () =>
  new FixedClock(new Date(startOfGameDate(GAME_DATE).getTime() + 6 * 3_600_000));

describe.skipIf(!testDb)("daily activities rollback (fault injection)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let fixtureAnswerWord: string;
  let foodItemId: string;
  let poolSlug: string;

  beforeAll(async () => {
    userId = (await createTestUser(db, { username: `${prefix}_user` })).id;
    // Direct puzzle fixture: an INACTIVE answer (never part of the global
    // rotation) referenced by a puzzle row for this run's game date.
    const letters = () =>
      Array.from({ length: 4 }, () =>
        String.fromCharCode(65 + Math.floor(Math.random() * 26)),
      ).join("");
    const answer = await db.dailyWordAnswer.create({
      data: {
        difficulty: "EASY",
        word: letters(),
        sequencePosition: 3_000_000 + Math.floor(Math.random() * 900_000),
        active: false,
      },
    });
    fixtureAnswerWord = answer.word;
    await db.dailyWordPuzzle.create({
      data: {
        gameDate: GAME_DATE,
        difficulty: "EASY",
        answerId: answer.id,
        rewardCoins: 100n,
      },
    });

    foodItemId = (
      await createTestItem(db, {
        slug: `${prefix}-meal`,
        type: "FOOD",
        hungerRestore: 10,
      })
    ).id;
    poolSlug = `${prefix}-kitchen`;
    await db.dailyFoodPool.create({
      data: {
        slug: poolSlug,
        entries: { create: [{ itemId: foodItemId, selectionWeight: 10 }] },
      },
    });

    const bauble = await createTestItem(db, { slug: `${prefix}-bauble` });
    const pool = await db.dailyWheelItemPool.create({
      data: { slug: `${prefix}-pool` },
    });
    await db.dailyWheelItemPoolEntry.create({
      data: { poolId: pool.id, itemId: bauble.id, selectionWeight: 10 },
    });
    await db.dailyWheel.create({
      data: {
        slug: `${prefix}-itemwheel`,
        name: "Item Wheel",
        configurations: {
          create: {
            version: 1,
            active: true,
            prizes: {
              create: [
                {
                  label: "Bauble",
                  resultType: "ITEM_POOL",
                  weight: 10_000,
                  itemPoolId: pool.id,
                  displayOrder: 0,
                },
              ],
            },
          },
        },
      },
    });
    await db.dailyWheel.create({
      data: {
        slug: `${prefix}-coinwheel`,
        name: "Coin Wheel",
        configurations: {
          create: {
            version: 1,
            active: true,
            prizes: {
              create: [
                {
                  label: "Coins",
                  resultType: "COINS",
                  weight: 10_000,
                  coinAmount: 40n,
                  displayOrder: 0,
                },
              ],
            },
          },
        },
      },
    });
  });

  beforeEach(async () => {
    await db.rateLimitWindow.deleteMany({ where: { key: { contains: userId } } });
  });

  afterAll(async () => {
    await db.dailyWheelSpin.deleteMany({
      where: { wheel: { slug: { startsWith: prefix } } },
    });
    await db.dailyWheelConfiguration.deleteMany({
      where: { wheel: { slug: { startsWith: prefix } } },
    });
    await db.dailyWheelItemPool.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await db.dailyWheel.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.dailyFoodClaim.deleteMany({
      where: { pool: { slug: { startsWith: prefix } } },
    });
    await db.dailyFoodPool.deleteMany({ where: { slug: { startsWith: prefix } } });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("word solve: coin credit fails → guess, result, ledger, wallet all revert", async () => {
    const puzzle = await db.dailyWordPuzzle.findUniqueOrThrow({
      where: { gameDate_difficulty: { gameDate: GAME_DATE, difficulty: "EASY" } },
    });
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const faulty = withFault(db, { model: "user", method: "update" });
    await expect(
      submitGuess(faulty, {
        userId,
        difficulty: "EASY",
        guess: fixtureAnswerWord,
        idempotencyKey: randomUUID(),
        clock: clock(),
      }),
    ).rejects.toThrowError(InjectedFault);

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    const result = await db.dailyWordResult.findUnique({
      where: { userId_puzzleId: { userId, puzzleId: puzzle.id } },
      include: { guesses: true },
    });
    // Either no result row at all, or an untouched IN_PROGRESS shell.
    expect(result?.guesses ?? []).toHaveLength(0);
    expect(result?.attemptsUsed ?? 0).toBe(0);
    expect(
      await db.transaction.count({ where: { userId, type: "DAILY_WORD_REWARD" } }),
    ).toBe(0);

    // A clean retry solves and pays exactly once.
    const retry = await submitGuess(db, {
      userId,
      difficulty: "EASY",
      guess: fixtureAnswerWord,
      idempotencyKey: randomUUID(),
      clock: clock(),
    });
    expect(retry.status).toBe("SOLVED");
    const paid = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(paid.coins).toBe(before.coins + puzzle.rewardCoins);
  });

  it("wheel: item grant fails → spin row and ledger revert; retry succeeds", async () => {
    const faulty = withFault(db, { model: "inventoryEntry", method: "upsert" });
    await expect(
      spinWheel(faulty, {
        userId,
        wheelSlug: `${prefix}-itemwheel`,
        idempotencyKey: randomUUID(),
        clock: clock(),
      }),
    ).rejects.toThrowError(InjectedFault);
    expect(
      await db.dailyWheelSpin.count({
        where: { userId, wheel: { slug: `${prefix}-itemwheel` } },
      }),
    ).toBe(0);
    expect(
      await db.transaction.count({ where: { userId, type: "DAILY_WHEEL_PRIZE" } }),
    ).toBe(0);

    const retry = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-itemwheel`,
      idempotencyKey: randomUUID(),
      clock: clock(),
    });
    expect(retry.rewardType).toBe("ITEM");
    const stack = await db.inventoryEntry.findFirstOrThrow({
      where: { userId, item: { slug: `${prefix}-bauble` } },
    });
    expect(stack.quantity).toBe(1);
  });

  it("wheel: ledger write fails → nothing persists, wallet unchanged", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const faulty = withFault(db, { model: "transaction", method: "create" });
    await expect(
      spinWheel(faulty, {
        userId,
        wheelSlug: `${prefix}-coinwheel`,
        idempotencyKey: randomUUID(),
        clock: clock(),
      }),
    ).rejects.toThrowError(InjectedFault);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    expect(
      await db.dailyWheelSpin.count({
        where: { userId, wheel: { slug: `${prefix}-coinwheel` } },
      }),
    ).toBe(0);
  });

  it("meal: item grant fails → claim and ledger revert; retry grants once", async () => {
    const faulty = withFault(db, { model: "inventoryEntry", method: "upsert" });
    await expect(
      claimDailyMeal(faulty, {
        userId,
        poolSlug,
        idempotencyKey: randomUUID(),
        clock: clock(),
      }),
    ).rejects.toThrowError(InjectedFault);
    expect(
      await db.dailyFoodClaim.count({ where: { userId, gameDate: GAME_DATE } }),
    ).toBe(0);
    expect(
      await db.transaction.count({ where: { userId, type: "DAILY_FOOD_CLAIM" } }),
    ).toBe(0);
    expect(
      await db.inventoryEntry.findUnique({
        where: { userId_itemId: { userId, itemId: foodItemId } },
      }),
    ).toBeNull();

    const retry = await claimDailyMeal(db, {
      userId,
      poolSlug,
      idempotencyKey: randomUUID(),
      clock: clock(),
    });
    expect(retry.alreadyClaimed).toBe(false);
    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: foodItemId } },
    });
    expect(stack.quantity).toBe(1);
  });
});
