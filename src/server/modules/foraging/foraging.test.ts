/**
 * Foraging: the one acquisition a player initiates. Runs against a real
 * PostgreSQL database with its own fixture world.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { searchSpot } from "./search";
import { getSpotView } from "./queries";
import { ForageError } from "./errors";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("forage");
const DAY = new Date("2026-03-01T09:00:00Z");
const NEXT_DAY = new Date("2026-03-02T09:00:00Z");

async function expectForageError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ForageError);
  expect((error as ForageError).forageCode).toBe(code);
}

describe.skipIf(!testDb)("foraging (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let regionId: string;
  let locationId: string;
  let spotId: string;
  let commonItemId: string;
  let rareItemId: string;
  const spotSlug = `${prefix}-spot`;

  const search = (overrides: { now?: Date; key?: string } = {}) =>
    searchSpot(db, {
      userId,
      spotSlug,
      idempotencyKey: overrides.key ?? randomUUID(),
      clock: new FixedClock(overrides.now ?? DAY),
    });

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    userId = (await createTestUser(db, { username: `${prefix}_${suffix}` })).id;

    await db.forageFind.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.forageSpotEntry.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.forageSpot.deleteMany({ where: { slug: spotSlug } });
    await db.location.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });

    regionId = (
      await db.region.create({
        data: {
          slug: `${prefix}-region`,
          name: "Fixture Region",
          description: "",
          artKey: "x",
          published: true,
        },
      })
    ).id;
    locationId = (
      await db.location.create({
        data: {
          slug: `${prefix}-location`,
          regionId,
          name: "Fixture Hedgerow",
          description: "",
          artKey: "x",
          published: true,
        },
      })
    ).id;
    commonItemId =
      commonItemId ??
      (await createTestItem(db, { slug: `${prefix}-common` })).id;
    rareItemId =
      rareItemId ?? (await createTestItem(db, { slug: `${prefix}-rare` })).id;

    spotId = (
      await db.forageSpot.create({
        data: {
          slug: spotSlug,
          locationId,
          name: "The Fixture Hedge",
          description: "",
          dailyLimit: 3,
          nothingWeight: 0,
          nothingFlavor: "Nothing at all.\nStill nothing.",
          entries: {
            create: [
              {
                itemId: commonItemId,
                selectionWeight: 100,
                minQuantity: 1,
                maxQuantity: 2,
              },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await db.forageFind.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.forageSpotEntry.deleteMany({ where: { spot: { slug: spotSlug } } });
    await db.forageSpot.deleteMany({ where: { slug: spotSlug } });
    await db.location.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.transaction.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  it("grants what it found, ledgers it, and records the search", async () => {
    const before = (
      await db.user.findUniqueOrThrow({ where: { id: userId } })
    ).coins;
    const { result } = await search();

    expect(result.found).not.toBeNull();
    expect(result.found!.itemId).toBe(commonItemId);
    expect(result.found!.quantity).toBeGreaterThanOrEqual(1);
    expect(result.searchOrdinal).toBe(1);
    expect(result.remainingToday).toBe(2);

    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: commonItemId } },
    });
    expect(entry.quantity).toBe(result.found!.quantity);

    // A spot pays in items and never in coins — it must not be able to
    // become a coin faucet by accident.
    const ledger = await db.transaction.findFirstOrThrow({
      where: { userId, type: "FORAGE_FIND" },
    });
    expect(ledger.coinsDelta).toBe(0n);
    expect(ledger.quantity).toBe(result.found!.quantity);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBe(before);

    const find = await db.forageFind.findFirstOrThrow({
      where: { userId, spotId },
    });
    expect(find.transactionId).toBe(ledger.id);
    expect(find.gameDate).toBe("2026-03-01");
  });

  it("stops at the daily limit and starts again the next game day", async () => {
    for (let i = 0; i < 3; i++) {
      const { result } = await search();
      expect(result.searchOrdinal).toBe(i + 1);
    }
    await expectForageError(search(), "SEARCHED_OUT");

    // Yesterday's cap is not carried forward: missing a day costs nothing
    // and reaching the cap takes nothing away.
    const { result } = await search({ now: NEXT_DAY });
    expect(result.searchOrdinal).toBe(1);
    expect(result.gameDate).toBe("2026-03-02");
  });

  it("reports an empty-handed search rather than pretending it found something", async () => {
    // A spot that can only come up empty.
    await db.forageSpot.update({
      where: { id: spotId },
      data: { nothingWeight: 1_000 },
    });
    await db.forageSpotEntry.updateMany({
      where: { spotId },
      data: { active: false },
    });
    // ...but an inactive pool alone is "nothing to find", so give it one
    // active entry it will essentially never draw.
    await db.forageSpotEntry.updateMany({
      where: { spotId },
      data: { active: true, selectionWeight: 1 },
    });

    let sawNothing = false;
    for (let i = 0; i < 3 && !sawNothing; i++) {
      const { result } = await search();
      if (result.found === null) {
        sawNothing = true;
        expect(result.flavor).toMatch(/nothing/i);
        // It still used one of the day's searches, and it is still recorded.
        expect(result.searchOrdinal).toBe(i + 1);
        const find = await db.forageFind.findFirstOrThrow({
          where: { userId, spotId, searchOrdinal: i + 1 },
        });
        expect(find.itemId).toBeNull();
        expect(find.quantity).toBe(0);
        expect(find.transactionId).toBeNull();
      }
    }
    expect(sawNothing).toBe(true);
  });

  it("replays a duplicate submission instead of searching twice", async () => {
    const key = randomUUID();
    const first = await search({ key });
    const retry = await search({ key });
    expect(retry.replayed).toBe(true);
    expect(retry.result).toEqual(first.result);

    expect(await db.forageFind.count({ where: { userId, spotId } })).toBe(1);
    const entry = await db.inventoryEntry.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: commonItemId } },
    });
    expect(entry.quantity).toBe(first.result.found!.quantity);
  });

  it("concurrent searches cannot exceed the day's allowance", async () => {
    const { fulfilled } = await runConcurrently(
      Array.from({ length: 6 }, () => () => search()),
    );
    expect(fulfilled.length).toBeLessThanOrEqual(3);
    expect(await db.forageFind.count({ where: { userId, spotId } })).toBe(
      fulfilled.length,
    );

    // Every granted unit is accounted for, exactly once.
    const granted = fulfilled.reduce(
      (sum, r) => sum + (r.result.found?.quantity ?? 0),
      0,
    );
    const entry = await db.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId: commonItemId } },
    });
    expect(entry?.quantity ?? 0).toBe(granted);
  });

  it("refuses a closed spot and a spot with nothing distributable in it", async () => {
    await db.forageSpot.update({
      where: { id: spotId },
      data: { active: false },
    });
    await expectForageError(search(), "SPOT_CLOSED");
    await db.forageSpot.update({
      where: { id: spotId },
      data: { active: true },
    });

    // A retired item stops appearing here rather than failing at the grant:
    // the pool and the write must agree.
    await db.item.update({
      where: { id: commonItemId },
      data: { lifecycle: "RETIRED" },
    });
    await expectForageError(search(), "NOTHING_TO_FIND");
    await db.item.update({
      where: { id: commonItemId },
      data: { lifecycle: "ACTIVE" },
    });

    await expectForageError(
      searchSpot(db, {
        userId,
        spotSlug: `${prefix}-nowhere`,
        idempotencyKey: randomUUID(),
      }),
      "SPOT_NOT_FOUND",
    );

    expect(await db.forageFind.count({ where: { userId, spotId } })).toBe(0);
  });

  it("the view counts the day honestly and never leaks the pool", async () => {
    await db.forageSpotEntry.create({
      data: { spotId, itemId: rareItemId, selectionWeight: 1 },
    });

    const before = await getSpotView(db, {
      userId,
      spotSlug,
      gameDate: "2026-03-01",
    });
    expect(before).toMatchObject({
      dailyLimit: 3,
      searchedToday: 0,
      remainingToday: 3,
      available: true,
      todaysFinds: [],
    });
    // What a place can yield is learned by looking, not read off a table.
    expect(JSON.stringify(before)).not.toContain(rareItemId);
    expect(JSON.stringify(before)).not.toContain("selectionWeight");

    await search();
    const after = await getSpotView(db, {
      userId,
      spotSlug,
      gameDate: "2026-03-01",
    });
    expect(after?.searchedToday).toBe(1);
    expect(after?.remainingToday).toBe(2);
    expect(after?.todaysFinds).toHaveLength(1);
  });
});
