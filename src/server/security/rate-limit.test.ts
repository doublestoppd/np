import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { enforceRateLimit, RateLimitedError } from "./rate-limit";
import { testDb } from "@test/helpers/database";

/**
 * The sliding window's whole reason to exist: a fixed window let a caller
 * fire the full limit at the end of one bucket and again at the start of
 * the next — twice the limit across the seam. These assert the seam is
 * closed while a single steady window still admits exactly `limit`.
 */

const RULE = { name: "test-slide", limit: 5, windowSeconds: 60 } as const;

async function tryConsume(
  db: PrismaClient,
  subject: string,
  now: Date,
): Promise<boolean> {
  try {
    await enforceRateLimit(db, RULE, subject, { now });
    return true;
  } catch (error) {
    if (error instanceof RateLimitedError) return false;
    throw error;
  }
}

describe.skipIf(!testDb)("sliding-window rate limit (integration)", () => {
  const db = testDb as PrismaClient;
  const base = new Date("2026-03-01T00:00:00Z");

  afterAll(async () => {
    await db.rateLimitWindow.deleteMany({ where: { key: { contains: "test-slide" } } });
    await db.$disconnect();
  });

  it("admits exactly the limit inside one window", async () => {
    const subject = randomUUID();
    const at = new Date(base.getTime() + 5_000);
    const results: boolean[] = [];
    for (let i = 0; i < 7; i++) results.push(await tryConsume(db, subject, at));
    expect(results.filter(Boolean)).toHaveLength(RULE.limit);
    expect(results.slice(RULE.limit).every((r) => !r)).toBe(true);
  });

  it("refuses a full second burst across the window boundary", async () => {
    const subject = randomUUID();
    // Fill the first window near its end.
    const endOfFirst = new Date(base.getTime() + 58_000);
    for (let i = 0; i < RULE.limit; i++) {
      expect(await tryConsume(db, subject, endOfFirst)).toBe(true);
    }
    // Immediately after the boundary the previous window still weighs ~1,
    // so the next request is over the rolling limit — the burst a fixed
    // window would have allowed.
    const startOfSecond = new Date(base.getTime() + 61_000);
    expect(await tryConsume(db, subject, startOfSecond)).toBe(false);
  });

  it("lets the previous window decay so a later request is admitted", async () => {
    const subject = randomUUID();
    const endOfFirst = new Date(base.getTime() + 58_000);
    for (let i = 0; i < RULE.limit; i++) {
      await tryConsume(db, subject, endOfFirst);
    }
    // Most of the way through the second window, the first has decayed out
    // of view, so a fresh request is allowed again.
    const lateSecond = new Date(base.getTime() + 118_000);
    expect(await tryConsume(db, subject, lateSecond)).toBe(true);
  });
});
