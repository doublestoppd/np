/**
 * The arcade harness: everything The Paper Bird and The Long Way Up share
 * (ADR-62). PURE — no database, no crypto, no server imports, no DOM.
 *
 * These are the first two games in which the SIMULATION runs in the
 * browser. Every game before them was turn-based and server-authoritative:
 * the Stonesetter's Table holds the board and is sent card indices, the
 * Sorting Bench holds the shelves and is sent moves. You cannot do that
 * with a game that runs at fifty frames a second over a mobile connection.
 *
 * So the security model moves down a level rather than being abandoned.
 *
 * **The client never sends a score.** It sends the tick numbers it acted
 * on. The server replays the identical physics against the run's own seed
 * and derives the score itself. There is no number in the submission to
 * inflate — the same property the table has, expressed in ticks instead of
 * turns.
 *
 * **The physics are integer-only, and that is a correctness requirement
 * rather than a preference.** Replay has to agree bit-for-bit between a
 * phone's JS engine and the server's. IEEE-754 addition and multiplication
 * are specified exactly, so those would in fact agree — but `Math.sin`,
 * `Math.pow` and friends are explicitly implementation-defined, and one
 * transcendental smuggled into a physics step would make honest runs fail
 * verification on some devices and not others. The cheapest way to never
 * have that bug is to have no floats at all. Positions and velocities are
 * in FIXED-POINT units; see `UNIT`.
 *
 * **What this does not stop, stated plainly.** A determined person can
 * write a program that plays the game properly — computing an input trace
 * that really does clear a hundred gates — and submit it. No amount of
 * verification distinguishes that from a very good player, because it *is*
 * a very good player. Two things make it not worth doing: the wall-clock
 * floor below means the bot has to spend the same real minutes a human
 * would, and the reward curve is capped, so the hundredth gate pays
 * almost nothing more than the thirtieth. The defence against botting is
 * that botting is boring and pays badly, and that is deliberate.
 */

/**
 * Fixed-point scale. One world unit is 1000 internal units.
 *
 * Everything below — positions, velocities, accelerations, sizes — is an
 * integer in these units. Chosen so a full course fits comfortably inside
 * the 2^53 exact-integer range with room for the multiplications in a
 * step, and so a velocity of "one unit per tick" is a round number.
 */
export const UNIT = 1_000;

/**
 * Simulation step, in milliseconds. 50 ticks a second.
 *
 * Fixed, and not tied to the display's refresh rate: a 120Hz phone and a
 * 60Hz laptop must simulate the same game or the same inputs would produce
 * different scores. The renderer catches up by running as many whole ticks
 * as have elapsed, which is the standard fixed-timestep loop.
 */
export const TICK_MS = 20;

/**
 * The longest a run may last, in ticks — twenty minutes.
 *
 * Not a limit anybody will reach by playing. It bounds the submitted
 * payload and the server's replay cost, which is the actual reason it
 * exists: without it, "here is a trace describing nine hours" is a cheap
 * way to make the server work hard.
 */
export const MAX_TICKS = 60_000;

/** And the most events one run may contain, for the same reason. */
export const MAX_EVENTS = 4_000;

/**
 * The fewest ticks between two inputs — 60ms.
 *
 * A person cannot tap meaningfully faster than this, and neither game
 * rewards it. It is not a strong check on its own (a bot can space its
 * inputs), but it is free, and it catches the laziest kind of forged
 * trace: one that acts on every single tick.
 */
export const MIN_EVENT_GAP_TICKS = 3;

/**
 * How much less real time than simulated time a run may take before it is
 * refused, as a percentage.
 *
 * A run that simulated 90 seconds must have taken at least 90 × 0.8 = 72
 * seconds of wall clock. The slack is for clock skew, a slow submission,
 * and the fact that `startedAt` is stamped when the server issues the run
 * rather than when the player actually starts moving — all of which make
 * the real elapsed time LONGER, never shorter, so the tolerance only ever
 * forgives honest players.
 *
 * This is the check that makes botting cost time. A program that solves
 * the game instantly and posts a perfect trace fails it; a program that
 * sleeps through the run to pass it is spending exactly the minutes a
 * person would, for a capped and rather small reward.
 */
export const WALL_CLOCK_TOLERANCE_PCT = 80;

/** A run left open longer than this cannot be submitted at all. */
export const MAX_RUN_AGE_MS = 45 * 60_000;

/** Claims per game per game day. Playing is unlimited; paying is not. */
export const ARCADE_CLAIMS_PER_DAY = 3;

/**
 * A deterministic integer PRNG (SplitMix32).
 *
 * Seeded per run and advanced only by the course generator, so the client
 * and the server build the same course from the same seed. All arithmetic
 * is forced back into 32 bits with `>>> 0` / `Math.imul`, which is exactly
 * specified in JS and therefore identical everywhere.
 */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** Turns a run's hex seed into the 32-bit integer the generator wants. */
export function seedToInt(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** An integer in [min, max], from one draw. Inclusive at both ends. */
export function between(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + (rng() % (max - min + 1));
}

/**
 * One thing the player did, and when.
 *
 * `code` is the game's own vocabulary: The Paper Bird only ever says 1
 * ("beat once"), while The Long Way Up says which way it is now leaning.
 * Sharing the shape is what lets one codec, one validator and one replay
 * harness serve both.
 */
export interface InputEvent {
  tick: number;
  code: number;
}

/**
 * Fixed-width hex: four characters of tick, one of code.
 *
 * Fixed-width rather than delimited for the same reason the table's flip
 * log is: a malformed submission is then a length check rather than a
 * parser, and there is no separator to be clever with.
 */
const EVENT_CHARS = 5;

export function encodeTrace(events: readonly InputEvent[]): string {
  return events
    .map(
      (event) =>
        event.tick.toString(16).padStart(4, "0") + (event.code & 0xf).toString(16),
    )
    .join("");
}

export type TraceProblem =
  | "MALFORMED"
  | "TOO_MANY_EVENTS"
  | "OUT_OF_ORDER"
  | "TOO_FAST"
  | "TOO_LONG";

/**
 * Parses and vets a submitted trace.
 *
 * Every rule here describes something an honest client cannot produce, so
 * a failure voids the run rather than being repaired. Repairing would mean
 * guessing at intent, and a game that guesses is a game that can be
 * nudged (the table's rule, ADR-47).
 */
export function decodeTrace(
  encoded: string,
): { events: InputEvent[] } | { problem: TraceProblem } {
  if (!/^[0-9a-f]*$/.test(encoded) || encoded.length % EVENT_CHARS !== 0) {
    return { problem: "MALFORMED" };
  }
  const count = encoded.length / EVENT_CHARS;
  if (count > MAX_EVENTS) return { problem: "TOO_MANY_EVENTS" };

  const events: InputEvent[] = [];
  let previous = -MIN_EVENT_GAP_TICKS - 1;
  for (let i = 0; i < count; i += 1) {
    const chunk = encoded.slice(i * EVENT_CHARS, (i + 1) * EVENT_CHARS);
    const tick = Number.parseInt(chunk.slice(0, 4), 16);
    const code = Number.parseInt(chunk.slice(4), 16);
    if (tick > MAX_TICKS) return { problem: "TOO_LONG" };
    if (tick < previous) return { problem: "OUT_OF_ORDER" };
    if (tick - previous < MIN_EVENT_GAP_TICKS) return { problem: "TOO_FAST" };
    events.push({ tick, code });
    previous = tick;
  }
  return { events };
}

/**
 * What one game's physics has to provide.
 *
 * The harness owns the clock, the trace and the ending; a game owns its
 * world. Keeping the split here is what made the second game cheap: The
 * Long Way Up is a course generator and eleven lines of step function.
 */
export interface ArcadeSim<TState> {
  /** The world at tick zero, built from the run's seed. */
  start: (seed: string) => TState;
  /**
   * Advances exactly one tick. `code` is 0 when the player did nothing.
   * Must be a pure integer function of (state, code) — no clock, no
   * randomness that is not drawn from the state's own generator.
   */
  step: (state: TState, code: number) => TState;
  /** True once the run is over. Checked after every step. */
  ended: (state: TState) => boolean;
  /** The score so far. Must never decrease. */
  score: (state: TState) => number;
}

export interface ReplayResult {
  score: number;
  ticks: number;
  /** True when the trace ran to MAX_TICKS without the game ending. */
  exhausted: boolean;
}

/**
 * Replays a vetted trace and returns what actually happened.
 *
 * This is the whole verification. The server calls it and believes the
 * answer; the client calls the same simulation live and shows the player
 * the same thing, which is why an honest run always agrees.
 */
export function replay<TState>(
  sim: ArcadeSim<TState>,
  seed: string,
  events: readonly InputEvent[],
): ReplayResult {
  let state = sim.start(seed);
  let cursor = 0;
  let tick = 0;

  for (; tick < MAX_TICKS; tick += 1) {
    // Every event landing on this tick. The codec forbids two events
    // closer than MIN_EVENT_GAP_TICKS, so this is at most one — the loop
    // is here so a future game may allow simultaneous inputs without the
    // harness changing.
    let code = 0;
    while (cursor < events.length && (events[cursor] as InputEvent).tick === tick) {
      code = (events[cursor] as InputEvent).code;
      cursor += 1;
    }
    state = sim.step(state, code);
    if (sim.ended(state)) {
      return { score: sim.score(state), ticks: tick + 1, exhausted: false };
    }
  }
  return { score: sim.score(state), ticks: tick, exhausted: true };
}
