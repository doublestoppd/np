/**
 * Prize wheel integration: one spin per day, weight validation, secure
 * eligibility, atomic grants, recorded-result replay, and configuration
 * history stability.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient, WheelResultType } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";
import { spinWheel, validatePrizeWeights, WheelError } from "./spin";
import { getWheelView } from "./queries";
import { startOfGameDate, type GameDate } from "../game-day";

const prefix = fixturePrefix("dwheel");

const YEAR = 2100 + Math.floor(Math.random() * 800);
const MONTH = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DAY_ONE: GameDate = `${YEAR}-${MONTH}-05`;
const DAY_TWO: GameDate = `${YEAR}-${MONTH}-06`;

function clockAt(gameDate: GameDate): FixedClock {
  return new FixedClock(
    new Date(startOfGameDate(gameDate).getTime() + 9 * 3_600_000),
  );
}

interface PrizeSpec {
  label: string;
  resultType: WheelResultType;
  weight: number;
  coinAmount?: bigint;
  itemPoolId?: string;
  flavorText?: string;
}

describe.skipIf(!testDb)("daily prize wheel (integration)", () => {
  const db = testDb as PrismaClient;
  const userIds: string[] = [];

  async function freshUser(suffix: string): Promise<string> {
    const user = await createTestUser(db, { username: `${prefix}_${suffix}` });
    userIds.push(user.id);
    return user.id;
  }

  async function makeWheel(
    slug: string,
    prizes: PrizeSpec[],
    { version = 1 }: { version?: number } = {},
  ) {
    const wheel = await db.dailyWheel.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
    await db.dailyWheelConfiguration.updateMany({
      where: { wheelId: wheel.id },
      data: { active: false },
    });
    const configuration = await db.dailyWheelConfiguration.create({
      data: {
        wheelId: wheel.id,
        version,
        active: true,
        prizes: {
          create: prizes.map((prize, index) => ({
            label: prize.label,
            resultType: prize.resultType,
            weight: prize.weight,
            coinAmount: prize.coinAmount ?? null,
            itemPoolId: prize.itemPoolId ?? null,
            displayOrder: index,
            flavorText: prize.flavorText ?? "",
          })),
        },
      },
      include: { prizes: true },
    });
    return { wheel, configuration };
  }

  async function makePool(
    slug: string,
    entries: Array<{ itemId: string; weight?: number; min?: number; max?: number }>,
  ) {
    const pool = await db.dailyWheelItemPool.create({
      data: { slug, poolType: "COMMON" },
    });
    for (const entry of entries) {
      await db.dailyWheelItemPoolEntry.create({
        data: {
          poolId: pool.id,
          itemId: entry.itemId,
          selectionWeight: entry.weight ?? 100,
          minimumQuantity: entry.min ?? 1,
          maximumQuantity: entry.max ?? 1,
        },
      });
    }
    return pool;
  }

  beforeEach(async () => {
    for (const id of userIds) {
      await db.rateLimitWindow.deleteMany({ where: { key: { contains: id } } });
    }
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
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("validates that active weights sum to the configured total", async () => {
    expect(() =>
      validatePrizeWeights([
        { weight: 9_000, active: true },
        { weight: 1_000, active: true },
        { weight: 5, active: false },
      ]),
    ).not.toThrow();
    expect(() =>
      validatePrizeWeights([{ weight: 9_999, active: true }]),
    ).toThrowError(WheelError);

    await makeWheel(`${prefix}-badwheel`, [
      { label: "Off by one", resultType: "COINS", weight: 9_999, coinAmount: 1n },
    ]);
    const userId = await freshUser("badcfg");
    await expect(
      spinWheel(db, {
        userId,
        wheelSlug: `${prefix}-badwheel`,
        idempotencyKey: randomUUID(),
        clock: clockAt(DAY_ONE),
      }),
    ).rejects.toThrowError(WheelError);
  });

  it("grants coin prizes atomically and enforces one spin per game date", async () => {
    await makeWheel(`${prefix}-coins`, [
      { label: "Always 77", resultType: "COINS", weight: 10_000, coinAmount: 77n },
    ]);
    const userId = await freshUser("coins");
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });

    const key = randomUUID();
    const outcome = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-coins`,
      idempotencyKey: key,
      clock: clockAt(DAY_ONE),
    });
    expect(outcome.rewardType).toBe("COINS");
    expect(outcome.coinsAwarded).toBe("77");
    expect(outcome.alreadySpun).toBe(false);
    expect(outcome.rewardTransactionId).not.toBeNull();

    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + 77n);
    const ledger = await db.transaction.findMany({
      where: { userId, type: "DAILY_WHEEL_PRIZE" },
    });
    expect(ledger).toHaveLength(1);

    // Same key replays; a fresh key returns the recorded outcome; the
    // wallet is credited exactly once either way.
    const replay = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-coins`,
      idempotencyKey: key,
      clock: clockAt(DAY_ONE),
    });
    expect(replay.prizeId).toBe(outcome.prizeId);
    const retry = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-coins`,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    expect(retry.alreadySpun).toBe(true);
    expect(retry.prizeId).toBe(outcome.prizeId);
    const finalUser = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(finalUser.coins).toBe(before.coins + 77n);
    expect(
      await db.dailyWheelSpin.count({ where: { userId, gameDate: DAY_ONE } }),
    ).toBe(1);

    // A new game day allows a new spin.
    const nextDay = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-coins`,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_TWO),
    });
    expect(nextDay.alreadySpun).toBe(false);
    expect(nextDay.gameDate).toBe(DAY_TWO);
  });

  it("concurrent spins with distinct keys award exactly one outcome", async () => {
    await makeWheel(`${prefix}-race`, [
      { label: "Race Coins", resultType: "COINS", weight: 10_000, coinAmount: 10n },
    ]);
    const userId = await freshUser("race");
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const race = await runConcurrently([
      () =>
        spinWheel(db, {
          userId,
          wheelSlug: `${prefix}-race`,
          idempotencyKey: randomUUID(),
          clock: clockAt(DAY_ONE),
        }),
      () =>
        spinWheel(db, {
          userId,
          wheelSlug: `${prefix}-race`,
          idempotencyKey: randomUUID(),
          clock: clockAt(DAY_ONE),
        }),
    ]);
    // Both callers get an answer; at most one performed the award.
    expect(race.fulfilled.length).toBeGreaterThanOrEqual(1);
    const spins = await db.dailyWheelSpin.count({
      where: { userId, gameDate: DAY_ONE },
    });
    expect(spins).toBe(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + 10n);
  });

  it("item prizes respect lifecycle eligibility and grant through ownership", async () => {
    const active = await createTestItem(db, { slug: `${prefix}-bauble` });
    const disabled = await createTestItem(db, {
      slug: `${prefix}-broken`,
      lifecycle: "DISABLED",
    });
    const pool = await makePool(`${prefix}-pool`, [
      { itemId: active.id, min: 2, max: 2 },
      { itemId: disabled.id, weight: 100_000 },
    ]);
    await makeWheel(`${prefix}-items`, [
      {
        label: "Curiosity",
        resultType: "ITEM_POOL",
        weight: 10_000,
        itemPoolId: pool.id,
      },
    ]);
    const userId = await freshUser("items");
    const outcome = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-items`,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    // The DISABLED item can never be awarded, despite its huge weight.
    expect(outcome.rewardType).toBe("ITEM");
    expect(outcome.itemSlug).toBe(`${prefix}-bauble`);
    expect(outcome.itemQuantity).toBe(2);
    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: active.id } },
    });
    expect(stack.quantity).toBe(2);
    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId, type: "DAILY_WHEEL_PRIZE" },
    });
    expect(ledger.itemId).toBe(active.id);
    expect(ledger.quantity).toBe(2);

    // A wheel whose only prize pool is entirely ineligible cannot run.
    const deadPool = await makePool(`${prefix}-deadpool`, [
      { itemId: disabled.id },
    ]);
    await makeWheel(`${prefix}-dead`, [
      {
        label: "Nothing left",
        resultType: "ITEM_POOL",
        weight: 10_000,
        itemPoolId: deadPool.id,
      },
    ]);
    await expect(
      spinWheel(db, {
        userId: await freshUser("dead"),
        wheelSlug: `${prefix}-dead`,
        idempotencyKey: randomUUID(),
        clock: clockAt(DAY_ONE),
      }),
    ).rejects.toThrowError(WheelError);
  });

  it("NOTHING is a valid completed spin with no economic grant", async () => {
    await makeWheel(`${prefix}-nothing`, [
      {
        label: "Nothing",
        resultType: "NOTHING",
        weight: 10_000,
        flavorText: "Nothing. It was very neatly wrapped.",
      },
    ]);
    const userId = await freshUser("nothing");
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const outcome = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-nothing`,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    expect(outcome.rewardType).toBe("NOTHING");
    expect(outcome.coinsAwarded).toBe("0");
    expect(outcome.flavorText).toContain("neatly wrapped");
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins);
    expect(
      await db.transaction.count({ where: { userId, type: "DAILY_WHEEL_PRIZE" } }),
    ).toBe(0);
    const spin = await db.dailyWheelSpin.findFirstOrThrow({
      where: { userId, gameDate: DAY_ONE },
    });
    expect(spin.rewardTransactionId).toBeNull();
  });

  it("recorded spins keep their configuration when future versions change", async () => {
    const { configuration: v1 } = await makeWheel(`${prefix}-versioned`, [
      { label: "Original", resultType: "COINS", weight: 10_000, coinAmount: 5n },
    ]);
    const userId = await freshUser("versions");
    const outcome = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-versioned`,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_ONE),
    });
    expect(outcome.prizeLabel).toBe("Original");

    // Version 2 replaces version 1 for FUTURE spins only.
    const { configuration: v2 } = await makeWheel(
      `${prefix}-versioned`,
      [{ label: "Replacement", resultType: "COINS", weight: 10_000, coinAmount: 9n }],
      { version: 2 },
    );
    const recorded = await db.dailyWheelSpin.findFirstOrThrow({
      where: { userId, gameDate: DAY_ONE },
      include: { prize: true },
    });
    expect(recorded.configurationId).toBe(v1.id);
    expect(recorded.prize.label).toBe("Original");
    expect(recorded.awardedCoins).toBe(5n);

    const next = await spinWheel(db, {
      userId,
      wheelSlug: `${prefix}-versioned`,
      idempotencyKey: randomUUID(),
      clock: clockAt(DAY_TWO),
    });
    expect(next.prizeLabel).toBe("Replacement");
    const nextSpin = await db.dailyWheelSpin.findFirstOrThrow({
      where: { userId, gameDate: DAY_TWO },
    });
    expect(nextSpin.configurationId).toBe(v2.id);

    // The view resolves the recorded (historical) spin correctly too.
    const view = await getWheelView(db, {
      userId,
      gameDate: DAY_ONE,
      wheelSlug: `${prefix}-versioned`,
    });
    expect(view?.todaysSpin?.prizeLabel).toBe("Original");
    expect(view?.segments.map((segment) => segment.label)).toEqual([
      "Replacement",
    ]);
    // Slices render equally sized with icons; odds never reach the client.
    expect(view?.segments[0]).toHaveProperty("icon");
    expect(view?.segments[0]).not.toHaveProperty("weight");
  });
});
