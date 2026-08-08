/**
 * The Stonesetter's Table against a real database: the server-only
 * layout, the once-a-day payout, and the flips a client must not get away
 * with (ADR-47).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { currentRun, dayView, flipCard, startRun } from "./run";
import { buildLayout } from "./layout";
import { MatchingError } from "./errors";
import { MATCHING_CONFIG } from "@/lib/games/matching-rules";
import { FixedClock } from "@test/helpers/clock";
import { runConcurrently } from "@test/helpers/concurrency";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

const prefix = fixturePrefix("match");
const DAY = new Date("2032-06-11T10:00:00Z");
const NEXT_DAY = new Date("2032-06-12T10:00:00Z");
const clock = (at: Date = DAY) => new FixedClock(at);

async function expectMatchingError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(MatchingError);
  expect((error as MatchingError).matchingCode).toBe(code);
}

describe.skipIf(!testDb)("the stonesetter's table (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;

  /** Plays a run to completion, flipping optimally. Returns the flips used. */
  async function solve(runId: string, seed: string, difficulty: "GENTLE" | "BRISK" | "DEEP") {
    const layout = buildLayout(seed, difficulty);
    const partner = new Map<number, number>();
    layout.forEach((pair, card) => {
      const first = layout.indexOf(pair);
      if (first !== card) partner.set(first, card);
    });
    let last;
    for (const [a, b] of partner) {
      await flipCard(db, { userId, runId, card: a, clock: clock() });
      last = await flipCard(db, { userId, runId, card: b, clock: clock() });
    }
    return last!;
  }

  beforeEach(async () => {
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;
  });

  afterAll(async () => {
    await cleanupTestUsers(db, prefix);
    await db.$disconnect();
  });

  it("deals a face-down board and reveals only what has been turned", async () => {
    const view = await startRun(db, { userId, difficulty: "GENTLE", clock: clock() });
    expect(view.cards).toBe(MATCHING_CONFIG.GENTLE.pairs * 2);
    expect(view.matched).toEqual([]);
    expect(view.faceUp).toEqual([]);
    expect(view.pairsFound).toBe(0);

    // The seed is the whole security model: it must not be in the view.
    expect(JSON.stringify(view)).not.toContain("seed");
    const stored = await db.matchingRun.findUniqueOrThrow({
      where: { id: view.runId },
    });
    expect(Object.values(view)).not.toContain(stored.seed);

    const first = await flipCard(db, {
      userId,
      runId: view.runId,
      card: 0,
      clock: clock(),
    });
    // One stone up, and only that one's face is known.
    expect(first.view.faceUp).toHaveLength(1);
    expect(first.view.faceUp[0]!.card).toBe(0);
    expect(first.view.matched).toEqual([]);
  });

  /**
   * The board has to say what the SECOND stone was.
   *
   * A turn is resolved on the second flip, so `faceUp` is empty by the
   * time the response is built — a miss therefore came back looking
   * exactly like nothing had happened, and the player who had just tapped
   * a stone was shown no face at all. `lastTurn` carries both stones and
   * both faces so the client can hold them up before turning them back.
   *
   * It reveals nothing unearned: these are the two stones the player
   * turned, and being shown what you turned is the whole game.
   */
  it("reports the resolved turn, so a miss can be seen at all", async () => {
    const view = await startRun(db, { userId, difficulty: "GENTLE", clock: clock() });
    const stored = await db.matchingRun.findUniqueOrThrow({
      where: { id: view.runId },
    });
    const layout = buildLayout(stored.seed, "GENTLE");

    // A fresh board has no turn behind it.
    expect(view.lastTurn).toBeNull();

    // Mid-turn: one stone up, nothing resolved.
    const mid = await flipCard(db, { userId, runId: view.runId, card: 0, clock: clock() });
    expect(mid.view.lastTurn).toBeNull();

    // Two stones that do not match. `layout[0]` names the pair under card
    // 0, so the first card carrying anything else is a guaranteed miss.
    const miss = layout.findIndex((pair, card) => card !== 0 && pair !== layout[0]);
    expect(miss).toBeGreaterThan(0);
    const missed = await flipCard(db, {
      userId,
      runId: view.runId,
      card: miss,
      clock: clock(),
    });
    expect(missed.view.faceUp).toEqual([]);
    expect(missed.view.lastTurn).toEqual({
      cards: [0, miss],
      pairs: [layout[0], layout[miss]],
      matched: false,
    });
    expect(missed.view.pairsFound).toBe(0);

    // And a match reports itself as one, so the client knows not to hold
    // stones that are staying up anyway.
    const partner = layout.findIndex((pair, card) => card !== 0 && pair === layout[0]);
    await flipCard(db, { userId, runId: view.runId, card: 0, clock: clock() });
    const hit = await flipCard(db, {
      userId,
      runId: view.runId,
      card: partner,
      clock: clock(),
    });
    expect(hit.view.lastTurn?.matched).toBe(true);
    expect(hit.view.pairsFound).toBe(1);
  });

  it("pays a completed board once a day, per difficulty", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const view = await startRun(db, { userId, difficulty: "GENTLE", clock: clock() });
    const stored = await db.matchingRun.findUniqueOrThrow({
      where: { id: view.runId },
    });
    const finish = await solve(view.runId, stored.seed, "GENTLE");

    expect(finish.view.status).toBe("COMPLETED");
    expect(finish.view.pairsFound).toBe(MATCHING_CONFIG.GENTLE.pairs);
    // Solved optimally, so the par bonus applies.
    const expected =
      MATCHING_CONFIG.GENTLE.reward + MATCHING_CONFIG.GENTLE.parBonus;
    expect(finish.coinsAwarded).toBe(expected.toString());
    const after = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.coins).toBe(before.coins + expected);

    // A second identical board the same day pays nothing — and says so,
    // rather than quietly awarding zero.
    const second = await startRun(db, { userId, difficulty: "GENTLE", clock: clock() });
    const secondStored = await db.matchingRun.findUniqueOrThrow({
      where: { id: second.runId },
    });
    const again = await solve(second.runId, secondStored.seed, "GENTLE");
    expect(again.view.status).toBe("COMPLETED");
    expect(again.coinsAwarded).toBe("0");
    expect(again.alreadyPaidToday).toBe(true);
    const unchanged = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(unchanged.coins).toBe(after.coins);
    expect(
      await db.transaction.count({ where: { userId, type: "MATCHING_REWARD" } }),
    ).toBe(1);
  });

  it("pays each difficulty separately, and resets the next day", async () => {
    for (const difficulty of ["GENTLE", "BRISK"] as const) {
      const view = await startRun(db, { userId, difficulty, clock: clock() });
      const stored = await db.matchingRun.findUniqueOrThrow({
        where: { id: view.runId },
      });
      await solve(view.runId, stored.seed, difficulty);
    }
    const day = await dayView(db, { userId, gameDate: "2032-06-11" });
    expect(day.paidToday.sort()).toEqual(["BRISK", "GENTLE"]);

    // A new game day is a clean slate — nothing carries over either way.
    const tomorrow = await startRun(db, {
      userId,
      difficulty: "GENTLE",
      clock: clock(NEXT_DAY),
    });
    const stored = await db.matchingRun.findUniqueOrThrow({
      where: { id: tomorrow.runId },
    });
    const finish = await solve(tomorrow.runId, stored.seed, "GENTLE");
    expect(BigInt(finish.coinsAwarded)).toBeGreaterThan(0n);
  });

  it("voids a run that submits an impossible flip, and pays nothing", async () => {
    const view = await startRun(db, { userId, difficulty: "GENTLE", clock: clock() });
    await expectMatchingError(
      flipCard(db, { userId, runId: view.runId, card: 99, clock: clock() }),
      "ILLEGAL_FLIP",
    );
    const stored = await db.matchingRun.findUniqueOrThrow({
      where: { id: view.runId },
    });
    expect(stored.status).toBe("VOID");
    expect(
      await db.transaction.count({ where: { userId, type: "MATCHING_REWARD" } }),
    ).toBe(0);
    // And it is audited, because a legitimate client cannot do it.
    expect(
      await db.securityEvent.count({
        where: { userId, type: "suspicious-activity" },
      }),
    ).toBeGreaterThan(0);
  });

  it("refuses another player's run as though it did not exist", async () => {
    const view = await startRun(db, { userId, difficulty: "GENTLE", clock: clock() });
    const stranger = (
      await createTestUser(db, { username: `${prefix}_x${randomUUID().slice(0, 6)}` })
    ).id;
    await expectMatchingError(
      flipCard(db, { userId: stranger, runId: view.runId, card: 0, clock: clock() }),
      "RUN_NOT_FOUND",
    );
  });

  it("cannot be raced into double-appending a flip", async () => {
    const view = await startRun(db, { userId, difficulty: "GENTLE", clock: clock() });
    const race = await runConcurrently([
      () => flipCard(db, { userId, runId: view.runId, card: 0, clock: clock() }),
      () => flipCard(db, { userId, runId: view.runId, card: 1, clock: clock() }),
    ]);
    expect(race.fulfilled.length + race.rejected.length).toBe(2);
    const stored = await db.matchingRun.findUniqueOrThrow({
      where: { id: view.runId },
    });
    // The invariant is not "one wins" — if the two calls genuinely do not
    // overlap, both flips are legitimate and both should land. What must
    // never happen is a flip applied twice or a log that lost one, which
    // is what an unguarded append would produce.
    const landed = stored.flips.match(/../g) ?? [];
    expect(landed.length).toBe(race.fulfilled.length);
    expect(new Set(landed).size).toBe(landed.length);
    for (const card of landed) {
      expect(["00", "01"]).toContain(card);
    }
  });

  it("resumes an unfinished board rather than losing it", async () => {
    const view = await startRun(db, { userId, difficulty: "BRISK", clock: clock() });
    await flipCard(db, { userId, runId: view.runId, card: 0, clock: clock() });
    const resumed = await currentRun(db, { userId, difficulty: "BRISK" });
    expect(resumed?.runId).toBe(view.runId);
    expect(resumed?.flipsUsed).toBe(1);
    expect(resumed?.faceUp).toHaveLength(1);
  });

  it("abandons the old board when a fresh one is set", async () => {
    const first = await startRun(db, { userId, difficulty: "DEEP", clock: clock() });
    const second = await startRun(db, { userId, difficulty: "DEEP", clock: clock() });
    expect(second.runId).not.toBe(first.runId);
    const stale = await db.matchingRun.findUniqueOrThrow({
      where: { id: first.runId },
    });
    expect(stale.status).toBe("ABANDONED");
  });

  it("shuffles reproducibly and only from the seed", async () => {
    const a = buildLayout("cafebabe", "DEEP");
    expect(a).toEqual(buildLayout("cafebabe", "DEEP"));
    expect(a).not.toEqual(buildLayout("deadbeef", "DEEP"));
    // Exactly two of every pair, and nothing else.
    const counts = new Map<number, number>();
    for (const pair of a) counts.set(pair, (counts.get(pair) ?? 0) + 1);
    expect(counts.size).toBe(MATCHING_CONFIG.DEEP.pairs);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });
});
