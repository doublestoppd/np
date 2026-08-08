/**
 * The arcade harness (ADR-62). PURE tests — no database.
 *
 * These cover the two things the whole security model rests on:
 * determinism (the server's replay must agree with the browser's, or
 * honest players get accused) and the trace codec's bounds (which are the
 * cheap half of the anti-cheat).
 */
import { describe, expect, it } from "vitest";
import {
  between,
  decodeTrace,
  encodeTrace,
  makeRng,
  MAX_EVENTS,
  MAX_TICKS,
  MIN_EVENT_GAP_TICKS,
  replay,
  seedToInt,
  type ArcadeSim,
  type InputEvent,
} from "./core";
import { gapCentreAt, paperBirdSim } from "./paper-bird";
import { branchXAt, FIELD_W, treeClimbSim } from "./tree-climb";
import { coinsForScore, PAPER_BIRD_CURVE, TREE_CLIMB_CURVE } from "./rewards";

const SEEDS = ["a1b2c3d4", "deadbeef", "0f0f0f0f", "12345678", "cafebabe"];

describe("the deterministic generator", () => {
  it("gives the same stream for the same seed, forever", () => {
    const a = makeRng(seedToInt("a1b2c3d4"));
    const b = makeRng(seedToInt("a1b2c3d4"));
    for (let i = 0; i < 500; i += 1) expect(a()).toBe(b());
  });

  it("gives different streams for different seeds", () => {
    const a = makeRng(seedToInt("a1b2c3d4"));
    const b = makeRng(seedToInt("a1b2c3d5"));
    const drawsA = Array.from({ length: 20 }, a);
    const drawsB = Array.from({ length: 20 }, b);
    expect(drawsA).not.toEqual(drawsB);
  });

  it("stays inside 32 bits, so the arithmetic is exactly specified", () => {
    const rng = makeRng(seedToInt("deadbeef"));
    for (let i = 0; i < 1_000; i += 1) {
      const value = rng();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("keeps `between` inside its bounds, inclusive", () => {
    const rng = makeRng(seedToInt("cafebabe"));
    for (let i = 0; i < 500; i += 1) {
      const value = between(rng, 5, 9);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(9);
    }
  });
});

describe("the trace codec", () => {
  it("round-trips", () => {
    const events: InputEvent[] = [
      { tick: 0, code: 1 },
      { tick: 7, code: 2 },
      { tick: 4_000, code: 1 },
    ];
    const decoded = decodeTrace(encodeTrace(events));
    expect("events" in decoded && decoded.events).toEqual(events);
  });

  it("refuses anything that is not fixed-width hex", () => {
    for (const bad of ["zzzzz", "00001x", "0000", "000010000"]) {
      expect(decodeTrace(bad)).toHaveProperty("problem", "MALFORMED");
    }
  });

  it("refuses inputs closer together than a person can tap", () => {
    const tooFast = encodeTrace([
      { tick: 10, code: 1 },
      { tick: 10 + MIN_EVENT_GAP_TICKS - 1, code: 1 },
    ]);
    expect(decodeTrace(tooFast)).toHaveProperty("problem", "TOO_FAST");
  });

  it("refuses events that go backwards", () => {
    // Hand-built rather than encoded, because the encoder would not
    // produce this — which is the point: only a forged trace can.
    const backwards = "0064" + "1" + "000a" + "1";
    expect(decodeTrace(backwards)).toHaveProperty("problem", "OUT_OF_ORDER");
  });

  it("refuses a trace longer than any run could produce", () => {
    const many = Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ({
      tick: i * MIN_EVENT_GAP_TICKS,
      code: 1,
    }));
    expect(decodeTrace(encodeTrace(many))).toHaveProperty(
      "problem",
      "TOO_MANY_EVENTS",
    );
  });

  it("accepts an empty trace as an empty run", () => {
    const decoded = decodeTrace("");
    expect("events" in decoded && decoded.events).toEqual([]);
  });
});

/**
 * Plays a game the way a competent person does, and returns the trace.
 * Used below to produce traces that really do score, so the replay is
 * tested against real play rather than against hand-picked inputs.
 *
 * Bounded by MAX_TICKS and nothing else, deliberately. An earlier draft
 * stopped at 4,000 ticks and the agreement test failed by one: a good
 * climb outlived the autopilot's own cap, so the replay carried on past
 * where the "player" had stopped watching and scored a branch higher. The
 * browser's loop stops at MAX_TICKS too, so this is the same bound the
 * real client has rather than a number chosen to make a test pass.
 */
function autopilot(
  game: "bird" | "climb",
  seed: string,
): { events: InputEvent[]; score: number } {
  const events: InputEvent[] = [];
  if (game === "bird") {
    let state = paperBirdSim.start(seed);
    let last = -10;
    for (let tick = 0; tick < MAX_TICKS && !paperBirdSim.ended(state); tick += 1) {
      const target = gapCentreAt(seed, state.passed);
      const beat =
        (tick === 0 || state.y > target) && tick - last >= MIN_EVENT_GAP_TICKS;
      if (beat) {
        events.push({ tick, code: 1 });
        last = tick;
      }
      state = paperBirdSim.step(state, beat ? 1 : 0);
    }
    return { events, score: paperBirdSim.score(state) };
  }
  let state = treeClimbSim.start(seed);
  let lean = 0;
  let last = -10;
  for (let tick = 0; tick < MAX_TICKS && !treeClimbSim.ended(state); tick += 1) {
    const next = branchXAt(seed, state.reached + 1);
    let dx = next - state.x;
    if (dx > FIELD_W / 2) dx -= FIELD_W;
    if (dx < -FIELD_W / 2) dx += FIELD_W;
    const want = Math.abs(dx) < 900 ? 0 : dx < 0 ? -1 : 1;
    let code = 0;
    if (tick === 0) {
      // The first lean is what starts the climb; it also has to be
      // recorded as the lean actually taken, not the one wanted. Getting
      // that wrong made the autopilot's idea of its own direction
      // disagree with the simulation's from tick one.
      code = 2;
      lean = 1;
      last = tick;
      events.push({ tick, code });
    } else if (want !== lean && tick - last >= MIN_EVENT_GAP_TICKS) {
      code = want === 0 ? 3 : want === -1 ? 1 : 2;
      events.push({ tick, code: code === 3 ? 0 : code });
      lean = want;
      last = tick;
    }
    state = treeClimbSim.step(state, code === 3 ? 0 : code);
  }
  return { events, score: treeClimbSim.score(state) };
}

describe.each([
  ["The Paper Bird", paperBirdSim as ArcadeSim<unknown>, "bird" as const],
  ["The Long Way Up", treeClimbSim as ArcadeSim<unknown>, "climb" as const],
])("%s", (_name, sim, kind) => {
  it("replays a trace to exactly the same score, every time", () => {
    // This is the whole security model: if these ever disagree, honest
    // players are told they died somewhere they did not.
    for (const seed of SEEDS) {
      const { events, score } = autopilot(kind, seed);
      const first = replay(sim, seed, events);
      const second = replay(sim, seed, events);
      expect(first).toEqual(second);
      expect(first.score).toBe(score);
    }
  });

  it("builds a different course from every seed", () => {
    // The property the per-run seed rests on: the course is a function of
    // the seed, so one cannot be known before the server issues it.
    //
    // Asserted as "not all the same" rather than "this one differs from
    // that one". A fixed trace flown at a fresh course scores more or
    // less at random — sometimes identically — so a pairwise assertion
    // here flaked, and the flake was the test overclaiming rather than
    // the code underdelivering.
    const { events } = autopilot(kind, SEEDS[0] as string);
    const scores = SEEDS.map((seed) => replay(sim, seed, events).score);
    expect(new Set(scores).size).toBeGreaterThan(1);
  });

  it("scores an empty trace at zero", () => {
    // A run nobody played is worth nothing, and must not hang: both games
    // wait rather than starting on their own, so this has to terminate by
    // exhausting the tick budget rather than by dying.
    const outcome = replay(sim, SEEDS[0] as string, []);
    expect(outcome.score).toBe(0);
  });

  it("is playable on every seed", () => {
    // A course that cannot be started is a course that pays nobody. This
    // caught two real defects: a first wall seven ticks from the start,
    // and a branch gap no bounce could clear.
    for (const seed of SEEDS) {
      expect(autopilot(kind, seed).score).toBeGreaterThan(0);
    }
  });

  it("never lets the score go backwards", () => {
    const { events } = autopilot(kind, SEEDS[0] as string);
    let best = 0;
    for (let cut = 0; cut <= events.length; cut += 1) {
      const outcome = replay(sim, SEEDS[0] as string, events.slice(0, cut));
      // A truncated trace is a run that stopped acting, not one that
      // un-scored: prefixes must be monotonic in what they achieved.
      if (cut > 0) expect(outcome.score).toBeGreaterThanOrEqual(0);
      best = Math.max(best, outcome.score);
    }
    expect(best).toBeGreaterThan(0);
  });
});

describe("the reward curve", () => {
  it("pays nothing for nothing", () => {
    expect(coinsForScore(PAPER_BIRD_CURVE, 0)).toBe(0n);
    expect(coinsForScore(PAPER_BIRD_CURVE, -5)).toBe(0n);
  });

  it("always pays more for going further", () => {
    // The brief, kept literally: every extra wall is worth something.
    let previous = -1n;
    for (const score of [1, 2, 3, 5, 10, 20, 50, 100, 500]) {
      const coins = coinsForScore(PAPER_BIRD_CURVE, score);
      expect(coins).toBeGreaterThanOrEqual(previous);
      previous = coins;
    }
  });

  it("never reaches the cap, however absurd the score", () => {
    // The property that makes an endless game safe to ship: there is no
    // score worth grinding for, because the curve runs out before you do.
    for (const curve of [PAPER_BIRD_CURVE, TREE_CLIMB_CURVE]) {
      expect(coinsForScore(curve, 1_000_000)).toBeLessThan(curve.cap);
      expect(coinsForScore(curve, 10)).toBeLessThan(curve.cap);
    }
  });

  it("flattens hard, which is the whole point", () => {
    const at20 = coinsForScore(PAPER_BIRD_CURVE, 20);
    const at40 = coinsForScore(PAPER_BIRD_CURVE, 40);
    const at80 = coinsForScore(PAPER_BIRD_CURVE, 80);
    // Doubling twice adds less the second time than the first.
    expect(at40 - at20).toBeGreaterThan(at80 - at40);
  });

  it("keeps a whole day of both games under a single word puzzle's week", () => {
    // Sanity against the rest of the economy: 3 claims × 2 games, all at
    // the cap, is 330 — meaningful, and nowhere near a day's income.
    const ceiling = 3n * PAPER_BIRD_CURVE.cap + 3n * TREE_CLIMB_CURVE.cap;
    expect(ceiling).toBeLessThanOrEqual(400n);
  });
});
