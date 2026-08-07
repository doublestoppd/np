/**
 * The Wandering Lantern: the hunt itself, against a real PostgreSQL
 * database and a fixture world of its own.
 *
 * The fixture builds two regions with several locations each, because the
 * two properties worth defending — a wrong look tells you about the
 * region, and a leaked answer is worth one band — are both invisible in a
 * one-region, one-location world.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ensureDailyHunts, ensureHunt, lookForLantern } from "./hunt";
import { getHuntView, getLookHereView } from "./queries";
import { LanternError } from "./errors";
import { LOOKS_PER_DAY, REWARD_BY_LOOK } from "./config";
import { ROTATION_BANDS, bandForUser } from "../bands";
import type { GameDate } from "../game-day";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

const prefix = fixturePrefix("lantern");
const GAME_DATE: GameDate = "2031-05-14";
const DAY = new Date("2031-05-14T09:00:00Z");
const NEXT_DAY = new Date("2031-05-15T09:00:00Z");

async function expectLanternError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(LanternError);
  expect((error as LanternError).lanternCode).toBe(code);
}

describe.skipIf(!testDb)("the wandering lantern (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  /** Fixture locations by region, in creation order. */
  let northIds: string[];
  let southIds: string[];
  let allIds: string[];

  const look = (
    locationId: string,
    overrides: { now?: Date; key?: string } = {},
  ) =>
    lookForLantern(db, {
      userId,
      locationId,
      idempotencyKey: overrides.key ?? randomUUID(),
      clock: new FixedClock(overrides.now ?? DAY),
    });

  /** Where the lantern actually is for this account today. */
  async function hidingPlaceId(gameDate: GameDate = GAME_DATE): Promise<string> {
    const hunt = await db.lanternHunt.findUniqueOrThrow({
      where: { gameDate_band: { gameDate, band: bandForUser(userId) } },
      include: { clue: { select: { locationId: true } } },
    });
    return hunt.clue.locationId;
  }

  async function cleanFixtureWorld(): Promise<void> {
    await db.lanternLook.deleteMany({
      where: { search: { hunt: { clue: { location: { slug: { startsWith: prefix } } } } } },
    });
    await db.lanternSearch.deleteMany({
      where: { hunt: { clue: { location: { slug: { startsWith: prefix } } } } },
    });
    await db.lanternHunt.deleteMany({
      where: { clue: { location: { slug: { startsWith: prefix } } } },
    });
    await db.lanternClue.deleteMany({
      where: { location: { slug: { startsWith: prefix } } },
    });
    await db.location.deleteMany({ where: { slug: { startsWith: prefix } } });
    await db.region.deleteMany({ where: { slug: { startsWith: prefix } } });
  }

  async function makeRegion(name: string, count: number): Promise<string[]> {
    const region = await db.region.create({
      data: {
        slug: `${prefix}-${name}`,
        name: `Fixture ${name}`,
        description: "",
        artKey: "x",
        published: true,
      },
    });
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const location = await db.location.create({
        data: {
          slug: `${prefix}-${name}-${i}`,
          regionId: region.id,
          name: `Fixture ${name} ${i}`,
          description: "",
          artKey: "x",
          published: true,
        },
      });
      await db.lanternClue.create({
        data: { locationId: location.id, clue: `A riddle about ${name} ${i}.` },
      });
      ids.push(location.id);
    }
    return ids;
  }

  beforeEach(async () => {
    // The hunt draws from EVERY active clue in the database, so the real
    // seeded world would swamp the fixture. Clearing it keeps the draw
    // inside the fixture's own places; the seed puts them back.
    await db.lanternClue.updateMany({
      where: { location: { slug: { startsWith: prefix } } },
      data: { active: true },
    });
    await cleanFixtureWorld();
    await db.lanternClue.updateMany({ data: { active: false } });

    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;
    northIds = await makeRegion("north", 4);
    southIds = await makeRegion("south", 4);
    allIds = [...northIds, ...southIds];
  });

  afterAll(async () => {
    await cleanFixtureWorld();
    await cleanupTestUsers(db, prefix);
    // Put the real world's clues back the way the seed left them.
    await db.lanternClue.updateMany({ data: { active: true } });
    await db.$disconnect();
  });

  it("hides in exactly one of the eligible places, and stays there", async () => {
    const hunt = await ensureHunt(db, GAME_DATE, bandForUser(userId));
    const again = await ensureHunt(db, GAME_DATE, bandForUser(userId));
    expect(again.id).toBe(hunt.id);
    expect(again.clueId).toBe(hunt.clueId);
    expect(allIds).toContain(await hidingPlaceId());
  });

  it("pays the first-look rate for solving it outright", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const target = await hidingPlaceIdAfterEnsure();
    const { result } = await look(target);

    expect(result.found).toBe(true);
    expect(result.lookNumber).toBe(1);
    expect(result.rewardCoins).toBe(REWARD_BY_LOOK[0]!.toString());
    expect(result.foundAtName).toBeTruthy();
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + REWARD_BY_LOOK[0]!);
    // Exactly one ledger row, matching the snapshot on the search.
    const ledger = await db.transaction.findMany({
      where: { userId, type: "LANTERN_FOUND" },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.coinsDelta).toBe(REWARD_BY_LOOK[0]!);
  });

  it("pays less the longer it takes, but always pays", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const wrong = allIds.filter((id) => id !== target);
    await look(wrong[0]!);
    const { result } = await look(target);

    expect(result.found).toBe(true);
    expect(result.lookNumber).toBe(2);
    expect(result.rewardCoins).toBe(REWARD_BY_LOOK[1]!.toString());
    expect(REWARD_BY_LOOK[1]!).toBeLessThan(REWARD_BY_LOOK[0]!);
  });

  it("tells a miss whether it was at least the right region", async () => {
    // The consolation that makes three looks a deduction rather than a
    // coin toss. Without it, a wrong look teaches nothing.
    const target = await hidingPlaceIdAfterEnsure();
    const sameRegion = (northIds.includes(target) ? northIds : southIds).filter(
      (id) => id !== target,
    );
    const otherRegion = northIds.includes(target) ? southIds : northIds;

    const warm = await look(sameRegion[0]!);
    expect(warm.result.found).toBe(false);
    expect(warm.result.warmRegion).toBe(true);

    const cold = await look(otherRegion[0]!);
    expect(cold.result.found).toBe(false);
    expect(cold.result.warmRegion).toBe(false);
  });

  it("never reveals the hiding place to a miss", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const wrong = allIds.find((id) => id !== target)!;
    const { result } = await look(wrong);
    expect(result.foundAtName).toBeNull();

    // Nor through the read models, which the pages render from.
    const view = await getHuntView(db, { userId, gameDate: GAME_DATE });
    expect(view.foundAtName).toBeNull();
    expect(JSON.stringify(view)).not.toContain(
      (await db.location.findUniqueOrThrow({ where: { id: target } })).name,
    );
  });

  it("spends the day's looks and then stops, without scolding", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const wrong = allIds.filter((id) => id !== target);
    for (let i = 0; i < LOOKS_PER_DAY; i++) {
      const { result } = await look(wrong[i]!);
      expect(result.found).toBe(false);
      expect(result.looksRemaining).toBe(LOOKS_PER_DAY - 1 - i);
    }
    await expectLanternError(look(wrong[LOOKS_PER_DAY]!), "OUT_OF_LOOKS");

    const view = await getHuntView(db, { userId, gameDate: GAME_DATE });
    expect(view.status).toBe("OUT_OF_LOOKS");
    expect(view.looksRemaining).toBe(0);
    expect(view.rewardEarned).toBe("0");
  });

  it("refuses a second look at the same place without spending one", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const wrong = allIds.find((id) => id !== target)!;
    await look(wrong);
    await expectLanternError(look(wrong), "ALREADY_LOOKED_HERE");
    // The refusal is free: a mis-tap must not cost a look.
    const view = await getHuntView(db, { userId, gameDate: GAME_DATE });
    expect(view.looksUsed).toBe(1);
    expect(view.looksRemaining).toBe(LOOKS_PER_DAY - 1);
  });

  it("stops once found, and pays exactly once on a replay", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const key = randomUUID();
    const first = await look(target, { key });
    const replay = await look(target, { key });

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.result.rewardCoins).toBe(first.result.rewardCoins);
    expect(
      await db.transaction.count({ where: { userId, type: "LANTERN_FOUND" } }),
    ).toBe(1);

    // A fresh key at another place is refused rather than paid again.
    const wrong = allIds.find((id) => id !== target)!;
    await expectLanternError(look(wrong), "ALREADY_FOUND");
  });

  it("pays once when the same find arrives twice at once", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const key = randomUUID();
    const race = await runConcurrently([
      () => look(target, { key }),
      () => look(target, { key }),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(2);
    expect(
      await db.transaction.count({ where: { userId, type: "LANTERN_FOUND" } }),
    ).toBe(1);
    const search = await db.lanternSearch.findFirstOrThrow({
      where: { userId },
    });
    expect(search.looksUsed).toBe(1);
    expect(search.status).toBe("FOUND");
  });

  it("cannot exceed the day's looks under concurrent misses", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const wrong = allIds.filter((id) => id !== target);
    const race = await runConcurrently(
      wrong.slice(0, 5).map((id) => () => look(id)),
    );
    expect(race.fulfilled.length + race.rejected.length).toBe(5);
    const search = await db.lanternSearch.findFirstOrThrow({
      where: { userId },
    });
    expect(search.looksUsed).toBeLessThanOrEqual(LOOKS_PER_DAY);
    const looks = await db.lanternLook.count({ where: { searchId: search.id } });
    expect(looks).toBe(search.looksUsed);
  });

  it("moves the next day, and yesterday's misses do not follow", async () => {
    const target = await hidingPlaceIdAfterEnsure();
    const wrong = allIds.filter((id) => id !== target);
    for (let i = 0; i < LOOKS_PER_DAY; i++) {
      await look(wrong[i]!);
    }
    // A brand-new day: full allowance, clean board, nothing carried over.
    const tomorrow = await look(allIds[0]!, { now: NEXT_DAY });
    expect(tomorrow.result.lookNumber).toBe(1);
    const view = await getHuntView(db, { userId, gameDate: "2031-05-15" });
    expect(view.looksUsed).toBe(1);
    expect(view.looks).toHaveLength(1);
  });

  it("gives different bands different hiding places on the same day", async () => {
    // The anti-farming property: one leaked answer is worth one band.
    await ensureDailyHunts(db, GAME_DATE);
    const hunts = await db.lanternHunt.findMany({
      where: { gameDate: GAME_DATE },
    });
    expect(hunts).toHaveLength(ROTATION_BANDS);
    expect(new Set(hunts.map((h) => h.band)).size).toBe(ROTATION_BANDS);
    // Eight eligible places and 32 bands, so collisions are expected —
    // a collapse onto one place is the failure worth catching.
    expect(new Set(hunts.map((h) => h.clueId)).size).toBeGreaterThan(1);

    // Repeating the scheduler writes nothing further.
    expect(await ensureDailyHunts(db, GAME_DATE)).toBe(0);
  });

  it("will not hide somewhere retired or unpublished", async () => {
    await db.lanternClue.updateMany({
      where: { locationId: { in: southIds } },
      data: { active: false },
    });
    await db.location.updateMany({
      where: { id: { in: northIds.slice(2) } },
      data: { published: false },
    });
    await ensureDailyHunts(db, GAME_DATE);
    const hunts = await db.lanternHunt.findMany({
      where: { gameDate: GAME_DATE },
      include: { clue: { select: { locationId: true } } },
    });
    const eligible = new Set(northIds.slice(0, 2));
    for (const hunt of hunts) {
      expect(eligible.has(hunt.clue.locationId)).toBe(true);
    }
  });

  it("fails safely and visibly when there is nowhere to hide", async () => {
    await db.lanternClue.updateMany({ data: { active: false } });
    await expectLanternError(look(allIds[0]!), "NO_HIDING_PLACES");
  });

  it("refuses an unpublished or unknown place", async () => {
    await db.location.update({
      where: { id: southIds[0]! },
      data: { published: false },
    });
    await expectLanternError(look(southIds[0]!), "UNKNOWN_PLACE");
    await expectLanternError(look("not-a-real-location-id"), "UNKNOWN_PLACE");
  });

  it("reports per-location state without drawing a hunt", async () => {
    // A page view is not a reason to write.
    const cold = await getLookHereView(db, {
      userId,
      locationId: allIds[0]!,
      gameDate: GAME_DATE,
    });
    expect(cold.clue).toBeNull();
    expect(
      await db.lanternHunt.count({ where: { gameDate: GAME_DATE } }),
    ).toBe(0);

    const target = await hidingPlaceIdAfterEnsure();
    const wrong = allIds.find((id) => id !== target)!;
    await look(wrong);
    const here = await getLookHereView(db, {
      userId,
      locationId: wrong,
      gameDate: GAME_DATE,
    });
    expect(here.lookedHere).toBe(true);
    expect(here.looksRemaining).toBe(LOOKS_PER_DAY - 1);
    expect(here.nextReward).toBe(REWARD_BY_LOOK[1]!.toString());
    const elsewhere = await getLookHereView(db, {
      userId,
      locationId: target,
      gameDate: GAME_DATE,
    });
    expect(elsewhere.lookedHere).toBe(false);
  });

  /** Draws the day's hunt, then reports where it put the lantern. */
  async function hidingPlaceIdAfterEnsure(): Promise<string> {
    await ensureHunt(db, GAME_DATE, bandForUser(userId));
    return hidingPlaceId();
  }
});
