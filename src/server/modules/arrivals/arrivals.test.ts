/**
 * "While you were away." The rules under test are mostly about what this
 * must NOT do: report an absence, show an empty state, or blank itself
 * while the player is still reading it.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getArrivals } from "./queries";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";
import { createTestItem, cleanupTestItems } from "@test/factories/items";

const prefix = fixturePrefix("arrivals");
const NOW = new Date("2026-06-01T09:00:00Z");
const LAST_NIGHT = new Date("2026-05-31T21:00:00Z");

describe.skipIf(!testDb)("arrivals (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;
  let itemId: string;

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8);
    userId = (await createTestUser(db, { username: `${prefix}_${suffix}` })).id;
    itemId = itemId ?? (await createTestItem(db, { slug: `${prefix}-good` })).id;
  });

  afterAll(async () => {
    await db.transaction.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
    await cleanupTestItems(db, prefix);
    await db.$disconnect();
  });

  async function sell(quantity: number, proceeds: string, at: Date) {
    await db.transaction.create({
      data: {
        userId,
        type: "PLAYER_SALE",
        itemId,
        quantity,
        coinsDelta: 0n,
        note: "sold",
        metadata: { proceeds },
        createdAt: at,
      },
    });
  }

  it("says nothing on a first visit, and remembers it happened", async () => {
    expect(await getArrivals(db, { userId, now: NOW })).toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastSeenAt).toEqual(NOW);
  });

  it("reports what the shop sold overnight, and what it earned", async () => {
    await db.user.update({
      where: { id: userId },
      data: { lastSeenAt: LAST_NIGHT },
    });
    await sell(2, "80", new Date("2026-05-31T23:00:00Z"));
    await sell(1, "45", new Date("2026-06-01T02:00:00Z"));

    const arrivals = await getArrivals(db, { userId, now: NOW });
    expect(arrivals?.sales).toEqual({ count: 3, proceeds: "125" });
    expect(arrivals?.since).toEqual(LAST_NIGHT);

    // The visit is recorded, so the same news is not reported forever.
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastSeenAt).toEqual(NOW);
  });

  it("renders nothing rather than an empty state when nothing happened", async () => {
    // A panel saying "0 new" every morning is a small daily reproach.
    await db.user.update({
      where: { id: userId },
      data: { lastSeenAt: LAST_NIGHT },
    });
    expect(await getArrivals(db, { userId, now: NOW })).toBeNull();
  });

  it("never reports what the player missed — only what happened for them", async () => {
    // Nothing in the view has anywhere to put an absence: no day count,
    // no streak, no "you skipped". This asserts the shape stays that way.
    await db.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date("2026-05-01T09:00:00Z") },
    });
    await sell(1, "40", new Date("2026-05-30T09:00:00Z"));
    const arrivals = await getArrivals(db, { userId, now: NOW });
    expect(Object.keys(arrivals ?? {}).sort()).toEqual(["sales", "since"]);
  });

  it("does not blank itself while the player is still here", async () => {
    await db.user.update({
      where: { id: userId },
      data: { lastSeenAt: LAST_NIGHT },
    });
    await sell(1, "60", new Date("2026-06-01T01:00:00Z"));

    const first = await getArrivals(db, { userId, now: NOW });
    expect(first?.sales?.count).toBe(1);

    // A refresh five minutes later is the same visit: the stamp does not
    // move, and the panel is not re-reported as though it were new.
    const refreshed = new Date(NOW.getTime() + 5 * 60_000);
    expect(await getArrivals(db, { userId, now: refreshed })).toBeNull();
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastSeenAt).toEqual(NOW);
  });

  it("ignores sales from before the window and after it", async () => {
    await db.user.update({
      where: { id: userId },
      data: { lastSeenAt: LAST_NIGHT },
    });
    await sell(9, "999", new Date("2026-05-30T12:00:00Z"));
    await sell(1, "50", new Date("2026-06-01T04:00:00Z"));
    const arrivals = await getArrivals(db, { userId, now: NOW });
    expect(arrivals?.sales).toEqual({ count: 1, proceeds: "50" });
  });
});
