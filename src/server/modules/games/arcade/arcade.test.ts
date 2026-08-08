/**
 * The arcade run lifecycle and its anti-cheat (ADR-62).
 *
 * The tests that matter are the adversarial ones. A minigame that pays
 * coins and runs its simulation in the browser is the single most
 * attackable surface in this game, and the rules that hold it together are
 * only worth anything if each one is pinned:
 *
 *  - a forged score is not expressible, because there is no score field;
 *  - a forged TRACE scores what it actually achieves, which is nothing;
 *  - a perfect trace posted instantly is refused by the wall clock;
 *  - a trace from another run scores against a course that no longer
 *    exists;
 *  - and the fourth claim of the day never pays, however it is submitted.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { getArcadeDay, startRun, submitRun } from "./run";
import { ArcadeError } from "./errors";
import {
  ARCADE_CLAIMS_PER_DAY,
  encodeTrace,
  MIN_EVENT_GAP_TICKS,
  TICK_MS,
  type InputEvent,
} from "@/lib/games/arcade/core";
import { gapCentreAt, paperBirdSim } from "@/lib/games/arcade/paper-bird";
import { fixturePrefix, testDb } from "@test/helpers/database";
import { createTestUser, cleanupTestUsers } from "@test/factories/users";

const prefix = fixturePrefix("arcade");
const clock = (at: Date) => ({ now: () => at });
const AT = new Date("2032-08-02T11:00:00Z");

/** Plays The Paper Bird properly on a given seed. */
function flyWell(seed: string): { events: InputEvent[]; score: number } {
  const events: InputEvent[] = [];
  let state = paperBirdSim.start(seed);
  let last = -10;
  for (let tick = 0; tick < 20_000 && !state.dead; tick += 1) {
    const target = gapCentreAt(seed, state.passed);
    const beat =
      (tick === 0 || state.y > target) && tick - last >= MIN_EVENT_GAP_TICKS;
    if (beat) {
      events.push({ tick, code: 1 });
      last = tick;
    }
    state = paperBirdSim.step(state, beat ? 1 : 0);
  }
  return { events, score: state.passed };
}

/** A moment far enough after `AT` for a run of `ticks` to be plausible. */
function afterPlaying(ticks: number): Date {
  return new Date(AT.getTime() + ticks * TICK_MS + 2_000);
}

describe.skipIf(!testDb)("arcade (integration)", () => {
  const db = testDb as PrismaClient;
  let userId: string;

  beforeEach(async () => {
    userId = (
      await createTestUser(db, { username: `${prefix}_${randomUUID().slice(0, 8)}` })
    ).id;
  });

  afterAll(async () => {
    await db.arcadePayout.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await db.arcadeRun.deleteMany({
      where: { user: { username: { startsWith: prefix } } },
    });
    await cleanupTestUsers(db, prefix);
  });

  it("pays for a run the server itself replayed", async () => {
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const { events, score } = flyWell(run.seed);
    expect(score).toBeGreaterThan(0);

    const { result } = await submitRun(db, {
      userId,
      runId: run.runId,
      trace: encodeTrace(events),
      idempotencyKey: randomUUID(),
      clock: clock(afterPlaying(20_000)),
    });

    // The score the player is told is the one the SERVER derived.
    expect(result.score).toBe(score);
    expect(BigInt(result.coinsAwarded)).toBeGreaterThan(0n);

    const stored = await db.arcadeRun.findUniqueOrThrow({
      where: { id: run.runId },
    });
    expect(stored.status).toBe("FINISHED");
    expect(stored.score).toBe(score);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.coins).toBeGreaterThan(0n);
  });

  it("scores a forged trace at what it actually achieves", async () => {
    // The shape of a naive cheat: a very long trace of nothing in
    // particular, hoping length reads as skill. It does not, because the
    // server flies it and it hits the first wall.
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const nonsense = Array.from({ length: 300 }, (_, i) => ({
      tick: i * MIN_EVENT_GAP_TICKS,
      code: 1,
    }));

    const { result } = await submitRun(db, {
      userId,
      runId: run.runId,
      trace: encodeTrace(nonsense),
      idempotencyKey: randomUUID(),
      clock: clock(afterPlaying(20_000)),
    });
    // Beating on every third tick flies straight into the ceiling.
    expect(result.score).toBe(0);
    expect(result.coinsAwarded).toBe("0");
  });

  it("refuses a perfect run submitted faster than it could be played", async () => {
    // The check that costs a bot its time. A trace that really does clear
    // twenty walls, posted two seconds after the run opened.
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const { events, score } = flyWell(run.seed);
    expect(score).toBeGreaterThan(3);

    await expect(
      submitRun(db, {
        userId,
        runId: run.runId,
        trace: encodeTrace(events),
        idempotencyKey: randomUUID(),
        clock: clock(new Date(AT.getTime() + 2_000)),
      }),
    ).rejects.toBeInstanceOf(ArcadeError);

    const stored = await db.arcadeRun.findUniqueOrThrow({
      where: { id: run.runId },
    });
    expect(stored.status).toBe("VOID");
    // And the attempt is on the record for an operator to find.
    const events_ = await db.securityEvent.findMany({
      where: { userId, type: "arcade.implausible" },
    });
    expect(events_.length).toBeGreaterThan(0);
  });

  it("gives every run its own course", async () => {
    // What the per-run seed actually buys, stated honestly.
    //
    // It is NOT that a replayed trace scores badly: a trace is a fixed
    // list of tick numbers, and flying a generic one at a fresh course
    // does about as well as it did at the old one — an earlier version of
    // this test asserted otherwise and flaked roughly one run in six,
    // which was the test being wrong rather than the code.
    //
    // What it buys is that a course cannot be known before the server
    // hands it out, so no solution can be precomputed, banked, or shared
    // between players. Stopping somebody from solving THIS run's course
    // once they have it is the wall clock's job, not the seed's.
    const seeds = new Set<string>();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const run = await startRun(db, {
        userId,
        game: "PAPER_BIRD",
        clock: clock(AT),
      });
      seeds.add(run.seed);
    }
    expect(seeds.size).toBe(5);
  });

  it("refuses inputs closer together than a person can produce", async () => {
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const machineGun = encodeTrace([
      { tick: 5, code: 1 },
      { tick: 6, code: 1 },
    ]);
    await expect(
      submitRun(db, {
        userId,
        runId: run.runId,
        trace: machineGun,
        idempotencyKey: randomUUID(),
        clock: clock(afterPlaying(100)),
      }),
    ).rejects.toBeInstanceOf(ArcadeError);
  });

  it("pays three times a day and never a fourth", async () => {
    for (let attempt = 1; attempt <= ARCADE_CLAIMS_PER_DAY + 1; attempt += 1) {
      const run = await startRun(db, {
        userId,
        game: "PAPER_BIRD",
        clock: clock(AT),
      });
      const { events } = flyWell(run.seed);
      const { result } = await submitRun(db, {
        userId,
        runId: run.runId,
        trace: encodeTrace(events),
        idempotencyKey: randomUUID(),
        clock: clock(afterPlaying(20_000)),
      });
      if (attempt <= ARCADE_CLAIMS_PER_DAY) {
        expect(BigInt(result.coinsAwarded)).toBeGreaterThan(0n);
      } else {
        // The fourth run still SCORES — playing is unlimited — it simply
        // does not pay.
        expect(result.score).toBeGreaterThan(0);
        expect(result.coinsAwarded).toBe("0");
        expect(result.unpaid).toBe(true);
      }
    }

    const day = await getArcadeDay(db, {
      userId,
      game: "PAPER_BIRD",
      clock: clock(AT),
    });
    expect(day.claimsUsed).toBe(ARCADE_CLAIMS_PER_DAY);

    const payouts = await db.arcadePayout.count({ where: { userId } });
    expect(payouts).toBe(ARCADE_CLAIMS_PER_DAY);
  });

  it("keeps the two games' claims separate", async () => {
    // One shared domain, two independent allowances: spending the bird's
    // three must not touch the climb's.
    for (let i = 0; i < ARCADE_CLAIMS_PER_DAY; i += 1) {
      const run = await startRun(db, {
        userId,
        game: "PAPER_BIRD",
        clock: clock(AT),
      });
      const { events } = flyWell(run.seed);
      await submitRun(db, {
        userId,
        runId: run.runId,
        trace: encodeTrace(events),
        idempotencyKey: randomUUID(),
        clock: clock(afterPlaying(20_000)),
      });
    }
    const climb = await getArcadeDay(db, {
      userId,
      game: "TREE_CLIMB",
      clock: clock(AT),
    });
    expect(climb.claimsUsed).toBe(0);
  });

  it("replays a repeated submission instead of scoring twice", async () => {
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const { events } = flyWell(run.seed);
    const trace = encodeTrace(events);
    const key = randomUUID();
    const at = clock(afterPlaying(20_000));

    const first = await submitRun(db, {
      userId,
      runId: run.runId,
      trace,
      idempotencyKey: key,
      clock: at,
    });
    const second = await submitRun(db, {
      userId,
      runId: run.runId,
      trace,
      idempotencyKey: key,
      clock: at,
    });

    expect(second.replayed).toBe(true);
    expect(second.result.score).toBe(first.result.score);
    expect(await db.arcadePayout.count({ where: { userId } })).toBe(1);
  });

  it("refuses a second submission of the same run under a new key", async () => {
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const { events } = flyWell(run.seed);
    const trace = encodeTrace(events);
    await submitRun(db, {
      userId,
      runId: run.runId,
      trace,
      idempotencyKey: randomUUID(),
      clock: clock(afterPlaying(20_000)),
    });
    await expect(
      submitRun(db, {
        userId,
        runId: run.runId,
        trace,
        idempotencyKey: randomUUID(),
        clock: clock(afterPlaying(20_000)),
      }),
    ).rejects.toBeInstanceOf(ArcadeError);
    expect(await db.arcadePayout.count({ where: { userId } })).toBe(1);
  });

  it("refuses somebody else's run", async () => {
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const stranger = await createTestUser(db, {
      username: `${prefix}_x${randomUUID().slice(0, 6)}`,
    });
    const { events } = flyWell(run.seed);
    await expect(
      submitRun(db, {
        userId: stranger.id,
        runId: run.runId,
        trace: encodeTrace(events),
        idempotencyKey: randomUUID(),
        clock: clock(afterPlaying(20_000)),
      }),
    ).rejects.toBeInstanceOf(ArcadeError);
  });

  it("refuses a run left open far too long", async () => {
    const run = await startRun(db, { userId, game: "PAPER_BIRD", clock: clock(AT) });
    const { events } = flyWell(run.seed);
    await expect(
      submitRun(db, {
        userId,
        runId: run.runId,
        trace: encodeTrace(events),
        idempotencyKey: randomUUID(),
        clock: clock(new Date(AT.getTime() + 3 * 60 * 60_000)),
      }),
    ).rejects.toBeInstanceOf(ArcadeError);
  });

  it("reports the player's own best and nobody else's", async () => {
    const other = await createTestUser(db, {
      username: `${prefix}_o${randomUUID().slice(0, 6)}`,
    });
    const theirs = await startRun(db, {
      userId: other.id,
      game: "PAPER_BIRD",
      clock: clock(AT),
    });
    const good = flyWell(theirs.seed);
    await submitRun(db, {
      userId: other.id,
      runId: theirs.runId,
      trace: encodeTrace(good.events),
      idempotencyKey: randomUUID(),
      clock: clock(afterPlaying(20_000)),
    });

    const mine = await getArcadeDay(db, {
      userId,
      game: "PAPER_BIRD",
      clock: clock(AT),
    });
    expect(mine.bestEver).toBe(0);
  });
});
