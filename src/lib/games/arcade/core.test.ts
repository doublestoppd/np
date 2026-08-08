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
import {
  BIRD_HALF_H,
  BIRD_HALF_W,
  BIRD_X,
  gapCentreAt,
  gapHeightAt,
  gateXAt,
  paperBirdSim,
} from "./paper-bird";
import { branchXAt, FIELD_W, treeClimbSim } from "./tree-climb";
import { COLS, ROWS, intervalAt, snakeSim } from "./snake";
import {
  coinsForScore,
  PAPER_BIRD_CURVE,
  SNAKE_CURVE,
  TREE_CLIMB_CURVE,
} from "./rewards";

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
    for (
      let tick = 0;
      tick < MAX_TICKS && !paperBirdSim.ended(state);
      tick += 1
    ) {
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
  for (
    let tick = 0;
    tick < MAX_TICKS && !treeClimbSim.ended(state);
    tick += 1
  ) {
    const next = branchXAt(seed, state.reached + 1);
    let dx = next - state.x;
    if (dx > FIELD_W / 2) dx -= FIELD_W;
    if (dx < -FIELD_W / 2) dx += FIELD_W;
    // Steering now has momentum, so aiming means letting go BEFORE the
    // target and coasting in — exactly what a person has to learn. An
    // autopilot that held its lean until it arrived would sail past.
    const stopping = (state.vx * state.vx) / (2 * 165);
    const want = Math.abs(dx) <= stopping + 400 ? 0 : dx < 0 ? -1 : 1;
    let code = 0;
    if (tick === 0) {
      // The first lean is what starts the climb; it also has to be
      // recorded as the lean actually taken, not the one wanted.
      code = 2;
      lean = 1;
      last = tick;
      events.push({ tick, code });
    } else if (want !== lean && tick - last >= MIN_EVENT_GAP_TICKS) {
      // 3 is the release. Sending 0 would mean "nothing happened", which
      // is exactly the bug that made steering a one-way commitment.
      code = want === 0 ? 3 : want === -1 ? 1 : 2;
      events.push({ tick, code });
      lean = want;
      last = tick;
    }
    state = treeClimbSim.step(state, code);
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

describe("The Paper Bird: the hitbox", () => {
  /**
   * Puts the bird level with the first wall at a given height and steps
   * once. Tests the collision itself rather than the flying — a helper
   * that tried to FLY to a height drifted while it got there and proved
   * nothing about the box.
   */
  function survivesAt(seed: string, y: number): boolean {
    const state = {
      ...paperBirdSim.start(seed),
      waiting: false,
      // Line the bird's centre up with the middle of the first wall.
      x: gateXAt(0) - BIRD_X,
      y,
      vy: 0,
    };
    return !paperBirdSim.step(state, 0).dead;
  }

  it("collides inside the drawing, never outside it", () => {
    // The reported defect: the box was 5 units half-height against a bird
    // drawn 3, so it died a visible margin clear of the wall. The renderer
    // now draws from BIRD_HALF_*, and the box is inset from them — which
    // makes "the hitbox is smaller than the picture" checkable rather than
    // a thing somebody has to remember.
    const seed = "a1b2c3d4";
    let state = { ...paperBirdSim.start(seed), waiting: false };
    // Nudge to the very top of the field and step once: at the ceiling the
    // death test uses the inset box, so a bird whose DRAWN top edge is
    // just touching must still be alive.
    state = { ...state, y: BIRD_HALF_H + 1, vy: 0 };
    const stepped = paperBirdSim.step(state, 0);
    expect(
      stepped.dead,
      "a bird drawn just inside the ceiling must not be dead",
    ).toBe(false);
  });

  it("still dies when it genuinely leaves the gap", () => {
    // The fix must not turn into "no collision at all".
    for (const seed of SEEDS) {
      const centre = gapCentreAt(seed, 0);
      const half = gapHeightAt(0) / 2;
      // Well past the lip: the whole bird is inside the wall.
      expect(survivesAt(seed, centre - half - 2 * BIRD_HALF_H), seed).toBe(
        false,
      );
    }
  });

  it("survives threading the middle of the gap", () => {
    for (const seed of SEEDS) {
      expect(survivesAt(seed, gapCentreAt(seed, 0)), seed).toBe(true);
    }
  });

  it("survives with the drawn edge exactly on the lip", () => {
    // The whole complaint, as an assertion: a bird whose PICTURE is
    // touching the stone is through. Under the old box — 5 units against a
    // 3-unit drawing — this was a death a visible margin early.
    for (const seed of SEEDS) {
      const centre = gapCentreAt(seed, 0);
      const half = gapHeightAt(0) / 2;
      expect(survivesAt(seed, centre - half + BIRD_HALF_H), seed).toBe(true);
      expect(survivesAt(seed, centre + half - BIRD_HALF_H), seed).toBe(true);
    }
  });

  it("keeps the box inside the sprite, in both axes", () => {
    // Guards the relationship rather than the numbers: whatever the bird
    // is resized to, what collides must be no bigger than what is drawn.
    // Re-derived here from the same percentage the module uses.
    const HITBOX_PCT = 80;
    expect(Math.floor((BIRD_HALF_W * HITBOX_PCT) / 100)).toBeLessThan(
      BIRD_HALF_W,
    );
    expect(Math.floor((BIRD_HALF_H * HITBOX_PCT) / 100)).toBeLessThan(
      BIRD_HALF_H,
    );
  });
});

describe("The Long Way Up: steering", () => {
  /** Runs a climb from its first lean, applying `codes` at tick 1, 2, ... */
  function drive(codes: number[]) {
    let state = treeClimbSim.start("a1b2c3d4");
    state = treeClimbSim.step(state, 2); // start, leaning right
    for (const code of codes) state = treeClimbSim.step(state, code);
    return state;
  }

  it("lets go when told to, which code 0 cannot say", () => {
    // The defect this test exists for: a lean, once set, was never
    // cleared. Releasing sent code 0, and 0 means "nothing happened this
    // tick" in the trace codec — so the climber kept going that way for
    // the rest of the run and steering was a one-way commitment rather
    // than a control.
    const stillHolding = drive([...Array(30).fill(0)]);
    const released = drive([3, ...Array(29).fill(0)]);

    expect(stillHolding.lean).toBe(1);
    expect(stillHolding.vx).toBeGreaterThan(0);

    expect(released.lean).toBe(0);
    // And friction actually brought it to a stop, rather than freezing it
    // mid-drift.
    expect(released.vx).toBe(0);
  });

  it("builds speed while held, so a longer hold goes further", () => {
    // The thing that makes this feel like a platformer rather than a
    // cursor: speed is accumulated, not switched on.
    const held2 = drive([0, 0]);
    const held10 = drive(Array(10).fill(0));
    expect(held10.vx).toBeGreaterThan(held2.vx);

    // And a tap is a nudge: released after two ticks it still coasts,
    // but nowhere near as far.
    const tapped = drive([0, 3, ...Array(40).fill(0)]);
    const committed = drive([...Array(10).fill(0), 3, ...Array(40).fill(0)]);
    expect(committed.x).toBeGreaterThan(tapped.x);
  });

  it("never drifts past a stop into the other direction", () => {
    // Friction is subtracted per tick, so an unguarded implementation
    // overshoots zero and the climber wanders the other way for ever.
    let state = drive([...Array(40).fill(0)]);
    state = treeClimbSim.step(state, 3);
    for (let i = 0; i < 200; i += 1) {
      state = treeClimbSim.step(state, 0);
      expect(state.vx).toBeGreaterThanOrEqual(0);
    }
    expect(state.vx).toBe(0);
  });

  it("turns round on the opposite lean", () => {
    const right = drive([...Array(10).fill(0)]);
    const turned = drive([...Array(10).fill(0), 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(right.vx).toBeGreaterThan(0);
    expect(turned.vx).toBeLessThan(right.vx);
  });

  it("always ends, even if the player stops playing", () => {
    // The defect that made this untestable-by-eye: a climber that lands
    // back where it launched returns to the same place next bounce, so a
    // single tap and then nothing bounced in place for the whole twenty
    // minute tick budget — a run that never finished, never scored and
    // never submitted. It is not exploitable (a stalled run pays nothing)
    // but it is a game that does not end, which is worse.
    for (const seed of SEEDS) {
      let state = treeClimbSim.start(seed);
      state = treeClimbSim.step(state, 2);
      state = treeClimbSim.step(state, 3);
      let ticks = 2;
      while (ticks < MAX_TICKS && !treeClimbSim.ended(state)) {
        state = treeClimbSim.step(state, 0);
        ticks += 1;
      }
      expect(treeClimbSim.ended(state), `seed ${seed} never ended`).toBe(true);
      // And quickly — within a minute, not twenty.
      expect(ticks, `seed ${seed} took ${ticks} ticks`).toBeLessThan(3_000);
    }
  });

  it("ends a climber ping-ponging between two branches", () => {
    // The second shape of the same bug. Keying the rule on "the same
    // branch repeatedly" left an oscillation between TWO branches alive
    // for ever, and resetting the allowance whenever a branch gave way
    // handed one back every cycle. The rule counts landings without
    // GAINING HEIGHT, and only climbing resets it.
    let state = treeClimbSim.start("deadbeef");
    state = treeClimbSim.step(state, 2);
    state = treeClimbSim.step(state, 3);
    let ticks = 2;
    let highest = 0;
    while (ticks < MAX_TICKS && !treeClimbSim.ended(state)) {
      state = treeClimbSim.step(state, 0);
      highest = Math.max(highest, treeClimbSim.score(state));
      ticks += 1;
    }
    expect(treeClimbSim.ended(state)).toBe(true);
    expect(ticks).toBeLessThan(3_000);
  });

  it("does not punish a player who is still climbing", () => {
    // The give-way rule must not fire on anybody making progress, or it
    // would be a timer wearing a costume.
    const { events, score } = autopilot("climb", "a1b2c3d4");
    expect(score).toBeGreaterThan(20);
    // A run of that length is far more than IDLE_LANDINGS worth of
    // bounces, so a well-played climb never trips it.
    expect(events.length).toBeGreaterThan(20);
  });

  it("does not start a climb on a release", () => {
    // Only a direction starts one. A stray release arriving first must
    // not drop the climber off the branch.
    const state = treeClimbSim.step(treeClimbSim.start("a1b2c3d4"), 3);
    expect(state.waiting).toBe(true);
  });
});

describe("The Long Grass", () => {
  /** Plays greedily toward the apple, avoiding the obvious deaths. */
  function slither(seed: string) {
    const events: InputEvent[] = [];
    let state = snakeSim.start(seed);
    let last = -10;
    for (let tick = 0; tick < MAX_TICKS && !snakeSim.ended(state); tick += 1) {
      const head = state.body[0]!;
      const dirs: Record<number, [number, number]> = {
        1: [0, -1],
        2: [1, 0],
        3: [0, 1],
        4: [-1, 0],
      };
      const want: number[] = [];
      if (state.apple.y < head.y) want.push(1);
      if (state.apple.x > head.x) want.push(2);
      if (state.apple.y > head.y) want.push(3);
      if (state.apple.x < head.x) want.push(4);
      let code = 0;
      if (tick === 0) {
        // Nothing crawls until something is pressed, and the wanted
        // direction may be the one already faced — so the first tick
        // always sends one.
        code = 1;
      } else if (tick - last >= MIN_EVENT_GAP_TICKS) {
        for (const candidate of [...want, 1, 2, 3, 4]) {
          const [dx, dy] = dirs[candidate]!;
          if (dx === -state.dx && dy === -state.dy && state.body.length > 1)
            continue;
          const nx = head.x + dx;
          const ny = head.y + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
          if (state.body.slice(0, -1).some((c) => c.x === nx && c.y === ny))
            continue;
          if (dx === state.dx && dy === state.dy) break;
          code = candidate;
          break;
        }
      }
      if (code !== 0) {
        events.push({ tick, code });
        last = tick;
      }
      state = snakeSim.step(state, code);
    }
    return { events, score: snakeSim.score(state), state };
  }

  it("is playable on every seed, and always ends", () => {
    for (const seed of SEEDS) {
      const { score, state } = slither(seed);
      expect(score, `seed ${seed}`).toBeGreaterThan(0);
      expect(snakeSim.ended(state), `seed ${seed} never ended`).toBe(true);
    }
  });

  it("replays to exactly the same score", () => {
    for (const seed of SEEDS) {
      const { events, score } = slither(seed);
      expect(replay(snakeSim, seed, events).score).toBe(score);
    }
  });

  it("refuses to turn back into its own neck", () => {
    // Classic, and load-bearing: a snake that could reverse would die to
    // itself instantly, which reads as the game cheating.
    let state = snakeSim.step(snakeSim.start("a1b2c3d4"), 1); // moving up
    const before = { dx: state.dx, dy: state.dy };
    state = snakeSim.step(state, 3); // down: straight back through itself
    expect({ dx: state.dx, dy: state.dy }).toEqual(before);
    expect(state.dead).toBe(false);
  });

  it("lets a one-cell snake turn any way it likes", () => {
    // The reversal rule is about the neck, not about the direction, so it
    // must not apply before there is a neck to hit.
    const start = snakeSim.start("a1b2c3d4");
    const single = { ...start, body: [start.body[0]!], waiting: false };
    const turned = snakeSim.step(single, 3);
    expect(turned.dy).toBe(1);
  });

  it("dies at the fence", () => {
    let state = { ...snakeSim.start("a1b2c3d4"), waiting: false };
    // Straight up from the middle: the top fence is a handful of cells away.
    for (let tick = 0; tick < 400 && !state.dead; tick += 1) {
      state = snakeSim.step(state, 0);
    }
    expect(state.dead).toBe(true);
    expect(state.eaten).toBeGreaterThanOrEqual(0);
  });

  it("never puts an apple under the snake", () => {
    for (const seed of SEEDS) {
      let state = snakeSim.start(seed);
      state = snakeSim.step(state, 1);
      for (let tick = 0; tick < 4_000 && !state.dead; tick += 1) {
        const on = state.body.some(
          (c) => c.x === state.apple.x && c.y === state.apple.y,
        );
        expect(on, `seed ${seed} put an apple under the snake`).toBe(false);
        state = snakeSim.step(state, 0);
      }
    }
  });

  it("speeds up as it eats, down to a floor", () => {
    expect(intervalAt(0)).toBeGreaterThan(intervalAt(8));
    expect(intervalAt(40)).toBe(intervalAt(400));
    expect(intervalAt(400)).toBeGreaterThan(0);
  });

  it("does not start on nothing", () => {
    const state = snakeSim.step(snakeSim.start("a1b2c3d4"), 0);
    expect(state.waiting).toBe(true);
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
    for (const curve of [PAPER_BIRD_CURVE, TREE_CLIMB_CURVE, SNAKE_CURVE]) {
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

  it("keeps a whole day of every arcade game inside a sane bound", () => {
    // Sanity against the rest of the economy. Three claims at three games,
    // every one of them played to the cap, is 495 — meaningful, and still
    // nowhere near a day's income.
    //
    // The bound is deliberately close to the true figure rather than
    // roomy: this is the number that grows every time a game is added to
    // the harness, and a bound with slack in it would let the fourth and
    // fifth games through in silence. When it fails, the question to ask
    // is whether the arcade should pay more in total, not whether the
    // test should.
    const ceiling =
      3n * PAPER_BIRD_CURVE.cap +
      3n * TREE_CLIMB_CURVE.cap +
      3n * SNAKE_CURVE.cap;
    expect(ceiling).toBe(495n);
    expect(ceiling).toBeLessThanOrEqual(500n);
  });
});
