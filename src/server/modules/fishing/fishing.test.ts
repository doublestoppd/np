/**
 * Fishing: the size draw, the private personal best, and the day's bound
 * (ADR-47). Runs against a real database with its own fixture water.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { castLine } from "./cast";
import { getFishingSpotView, getFishRecords } from "./queries";
import { FishingError } from "./errors";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("fish");
const DAY = new Date("2033-04-04T08:00:00Z");
const NEXT_DAY = new Date("2033-04-05T08:00:00Z");

async function expectFishingError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(FishingError);
  expect((error as FishingError).fishingCode).toBe(code);
}

describe.skipIf(!testDb)("fishing (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let locationId: string;
  let spotId: string;
  let fishId: string;
  const spotSlug = `${prefix}-water`;

  const cast = (overrides: { now?: Date; key?: string } = {}) =>
    castLine(db, {
      userId,
      spotSlug,
      idempotencyKey: overrides.key ?? randomUUID(),
      clock: new FixedClock(overrides.now ?? DAY),
    });

  beforeEach(async () => {
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;
    await db.fishCatch.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.fishingSpotEntry.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.fishingSpot.deleteMany({ where: { slug: spotSlug } });
    await db.location.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });

    const region = await db.region.create({
      data: {
        slug: `${prefix}-region`,
        name: "Fixture Fells",
        description: "",
        artKey: "x",
        published: true,
      },
    });
    locationId = (
      await db.location.create({
        data: {
          slug: `${prefix}-tarn`,
          regionId: region.id,
          name: "Fixture Tarn",
          description: "",
          artKey: "x",
          published: true,
        },
      })
    ).id;
    fishId =
      fishId ??
      (
        await createTestItem(db, {
          slug: `${prefix}-char`,
          type: "FOOD",
          hungerRestore: 10,
        })
      ).id;

    spotId = (
      await db.fishingSpot.create({
        data: {
          slug: spotSlug,
          locationId,
          name: "The Fixture Water",
          description: "",
          dailyLimit: 3,
          emptyWeight: 0,
          emptyFlavor: "Nothing at all.\nStill nothing.",
          entries: {
            create: [
              {
                itemId: fishId,
                selectionWeight: 100,
                minLength: 20,
                maxLength: 40,
              },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await db.fishCatch.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.fishingSpotEntry.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.fishingSpot.deleteMany({ where: { slug: spotSlug } });
    await db.location.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("lands one fish with a size inside the water's range", async () => {
    const { result } = await cast();
    expect(result.itemSlug).toBe(`${prefix}-char`);
    // The size is the activity: it must be drawn, and drawn in range.
    expect(result.lengthCm).toBeGreaterThanOrEqual(20);
    expect(result.lengthCm).toBeLessThanOrEqual(40);
    expect(result.castOrdinal).toBe(1);
    expect(result.remainingToday).toBe(2);

    const stack = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: fishId } },
    });
    expect(stack.quantity).toBe(1);
    // A catch is a movement, so it carries a ledger row.
    expect(
      await db.transaction.count({ where: { userId, type: "FORAGE_FIND" } }),
    ).toBe(1);
  });

  it("varies the size across casts", async () => {
    // A fixed size would make the personal best meaningless — this is the
    // assertion that the range is actually being drawn from.
    const sizes = new Set<number>();
    for (let day = 0; day < 12; day++) {
      const now = new Date(DAY.getTime() + day * 86_400_000);
      const { result } = await cast({ now });
      sizes.add(result.lengthCm);
    }
    expect(sizes.size).toBeGreaterThan(3);
  });

  it("records a personal best, and only raises it", async () => {
    const first = await cast();
    expect(first.result.personalBest).toBe(true);
    expect(first.result.previousBestCm).toBeNull();

    const record = await db.fishRecord.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: fishId } },
    });
    expect(record.lengthCm).toBe(first.result.lengthCm);

    // Force a smaller fish: the record must not fall.
    await db.fishingSpotEntry.updateMany({
      where: { spotId, itemId: fishId },
      data: { minLength: 1, maxLength: 1 },
    });
    const small = await cast();
    expect(small.result.lengthCm).toBe(1);
    expect(small.result.personalBest).toBe(false);
    const held = await db.fishRecord.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: fishId } },
    });
    expect(held.lengthCm).toBe(first.result.lengthCm);

    // And a bigger one raises it, reporting what it beat.
    await db.fishingSpotEntry.updateMany({
      where: { spotId, itemId: fishId },
      data: { minLength: 99, maxLength: 99 },
    });
    const big = await cast();
    expect(big.result.personalBest).toBe(true);
    expect(big.result.previousBestCm).toBe(first.result.lengthCm);
    expect(big.result.lengthCm).toBe(99);
  });

  it("keeps each player's records to themselves", async () => {
    await cast();
    const stranger = (
      await createTestUser(db, { username: `${prefix}_x${randomUUID().slice(0, 6)}` })
    ).id;
    const mine = await getFishRecords(db, { userId });
    const theirs = await getFishRecords(db, { userId: stranger });
    expect(mine).toHaveLength(1);
    // A fresh account has no records and cannot see anybody else's; there
    // is deliberately no query that would let it.
    expect(theirs).toEqual([]);
  });

  it("spends the day's casts and then stops, without scolding", async () => {
    for (let i = 0; i < 3; i++) {
      await cast();
    }
    await expectFishingError(cast(), "FISHED_OUT");
    const view = await getFishingSpotView(db, {
      userId,
      spotSlug,
      gameDate: "2033-04-04",
    });
    expect(view?.remainingToday).toBe(0);
    expect(view?.castsToday).toBe(3);

    // Tomorrow is a clean slate.
    const tomorrow = await cast({ now: NEXT_DAY });
    expect(tomorrow.result.castOrdinal).toBe(1);
  });

  it("cannot be raced past the day's limit", async () => {
    const race = await runConcurrently([
      () => cast(),
      () => cast(),
      () => cast(),
      () => cast(),
      () => cast(),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(5);
    const landed = await db.fishCatch.count({
      where: { userId, spotId, gameDate: "2033-04-04" },
    });
    expect(landed).toBeLessThanOrEqual(3);
    const stack = await db.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId: fishId } },
    });
    // Every recorded catch granted exactly one fish, and no catch granted
    // one without being recorded.
    expect(stack?.quantity ?? 0).toBe(landed);
  });

  it("replays a duplicate cast rather than fishing again", async () => {
    const key = randomUUID();
    const first = await cast({ key });
    const replay = await cast({ key });
    expect(replay.replayed).toBe(true);
    expect(replay.result.lengthCm).toBe(first.result.lengthCm);
    expect(
      await db.fishCatch.count({ where: { userId, spotId, gameDate: "2033-04-04" } }),
    ).toBe(1);
  });

  it("records an empty cast without granting or ledgering anything", async () => {
    await db.fishingSpotEntry.updateMany({
      where: { spotId },
      data: { active: false },
    });
    await db.fishingSpot.update({
      where: { id: spotId },
      data: { emptyWeight: 100 },
    });
    try {
      // Every species inactive is "nothing biting", not a silent empty.
      await expectFishingError(cast(), "NOTHING_BITING");
    } finally {
      await db.fishingSpotEntry.updateMany({
        where: { spotId },
        data: { active: true },
      });
    }

    // With a live table and an empty weight, the empty outcome is drawn
    // from the same table and still uses a cast.
    await db.fishingSpotEntry.updateMany({
      where: { spotId },
      data: { selectionWeight: 1 },
    });
    await db.fishingSpot.update({
      where: { id: spotId },
      data: { emptyWeight: 100_00 },
    });
    const { result } = await cast();
    if (result.itemSlug === null) {
      expect(result.lengthCm).toBe(0);
      expect(result.flavor.length).toBeGreaterThan(0);
      expect(
        await db.transaction.count({ where: { userId, type: "FORAGE_FIND" } }),
      ).toBe(0);
    }
    expect(
      await db.fishCatch.count({ where: { userId, spotId, gameDate: "2033-04-04" } }),
    ).toBe(1);
  });

  it("refuses a closed water without spending a cast", async () => {
    await db.fishingSpot.update({ where: { id: spotId }, data: { active: false } });
    await expectFishingError(cast(), "SPOT_CLOSED");
    expect(
      await db.fishCatch.count({ where: { userId, spotId } }),
    ).toBe(0);
  });

  it("refuses a water that does not exist", async () => {
    await expectFishingError(
      castLine(db, {
        userId,
        spotSlug: "no-such-water",
        idempotencyKey: randomUUID(),
        clock: new FixedClock(DAY),
      }),
      "SPOT_NOT_FOUND",
    );
  });
});
