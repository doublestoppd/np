import {
  between,
  makeRng,
  seedToInt,
  UNIT,
  type ArcadeSim,
} from "./core";

/**
 * The Long Way Up (ADR-62). PURE, integer-only.
 *
 * Going up an enormous beech, branch to branch. The climber bounces on its
 * own the moment it lands on anything; the only thing the player controls
 * is which way it is leaning. Fall past the bottom of what you can see and
 * the climb is over.
 *
 * The mirror image of The Paper Bird, deliberately: that one is a single
 * discrete tap under constant downward pressure, this one is a continuous
 * lean with the bouncing handled for you. Two different verbs on one
 * harness, which is the entire reason the harness exists.
 *
 * **Input codes: 1 lean left, 2 lean right, 3 let go.** Code 0 is not an
 * input at all — the trace codec uses it for "nothing happened this tick" —
 * so releasing needs a code of its own. The first draft did not have one,
 * and the consequence was the whole feel of the game: a tap set the lean
 * and NOTHING ever cleared it, so the climber drifted in that direction
 * forever and steering was a one-way commitment.
 *
 * The trace records the moments the lean CHANGES, so holding a direction
 * for four seconds is two events (press, release) rather than two hundred.
 *
 * **Y IS UP HERE**, unlike The Paper Bird, where y is screen-down. A climb
 * is measured in height gained and the score IS the y axis, so fighting
 * that to match the other game would mean negating in every branch
 * position, every draw call and the score itself. The first draft mixed
 * the two conventions — heights counted up, velocities integrated down —
 * and the climber shot through the floor on tick one, every time. Both
 * signs are stated on every constant below so it cannot happen twice.
 */

/** The trunk is this wide, and the view this tall. Fixed-point units. */
export const FIELD_W = 120 * UNIT;
export const VIEW_H = 200 * UNIT;

/**
 * How far below your best height the climb ends.
 *
 * NOT the height of the view, which is what it was at first — and a view
 * two hundred units tall against branch gaps of twenty is ten branches of
 * slack. A browser probe found the consequence: a climber could fall most
 * of the way back down and carry on, and one bouncing around the bottom
 * never died at all, so a run simply did not end. Four gaps is enough to
 * recover from a fumble and not enough to undo a climb.
 */
const FALL_LIMIT = 95 * UNIT;

/** Landings without gaining height before a branch gives way. */
const IDLE_LANDINGS = 6;

/**
 * Sideways movement, with weight.
 *
 * Not a velocity you switch on and off. Holding a direction ACCELERATES;
 * letting go decelerates back to a stop. That is what makes it read as
 * platformer movement rather than as dragging a cursor: a short tap is a
 * nudge, a long hold is a committed run, and turning round costs you the
 * speed you had. Friction is stronger than acceleration so a release
 * settles noticeably faster than a hold builds up, which keeps fine
 * adjustments near a branch possible.
 */
const LEAN_ACCEL = 105;
const LEAN_FRICTION = 165;
const MAX_LEAN_SPEED = 1_250;
/** Pulls DOWN, so it is subtracted from an up-positive velocity. */
const GRAVITY = 46;
/** Pushes UP, so it is positive. */
const BOUNCE_VELOCITY = 1_580;
/** The fastest a fall gets, downward, so also expressed as a positive. */
const TERMINAL_FALL = 2_400;

/** The climber's box. */
const HALF_W = 6 * UNIT;
const HALF_H = 6 * UNIT;

/**
 * Branches, and how they thin out as the tree does.
 *
 * Two curves, and it needs both. With only the gaps widening, a good
 * player was immortal: one bounce clears 27 units and the gaps stopped at
 * 22, so a run ended when the player got bored rather than when they made
 * a mistake — an autopilot reached branch 414 and was still going. Narrow
 * branches are what turn a climb into aiming.
 */
const BRANCH_HALF_W_START = 15 * UNIT;
const BRANCH_HALF_W_FLOOR = 7 * UNIT;
const BRANCH_NARROW_STEP = UNIT / 8;
const BRANCH_HALF_H = 2 * UNIT;

/** Half the width of branch `index`. Narrows, then holds. */
export function branchHalfWidthAt(index: number): number {
  return Math.max(
    BRANCH_HALF_W_FLOOR,
    Math.floor(BRANCH_HALF_W_START - index * BRANCH_NARROW_STEP),
  );
}
/**
 * Branch spacing. Both numbers are bounded by the bounce, not by feel.
 *
 * A bounce leaves at BOUNCE_VELOCITY and decelerates by GRAVITY, so it
 * rises v²/2a = 1580²/(2×46) ≈ 27 world units and no further. The first
 * draft set RISE_MAX to 40, which is a gap no bounce can ever clear: the
 * climb scored zero on every seed, because branch 1 was unreachable from
 * branch 0. These are set with real headroom under the apex so the climb
 * gets harder to AIM at and never impossible to reach.
 */
const RISE_START = 17 * UNIT;
const RISE_MAX = 25 * UNIT;
const RISE_STEP = UNIT / 5;

/**
 * The gap between branch `index` and the one below it.
 *
 * A bounce carries the climber a fixed height, so widening the gaps is the
 * whole difficulty curve. It stops at RISE_MAX, which is comfortably
 * inside what one bounce clears — the climb gets harder to AIM, never
 * impossible to reach.
 */
export function riseAt(index: number): number {
  return Math.min(RISE_MAX, Math.floor(RISE_START + index * RISE_STEP));
}

/** The height of branch `index` above the foot of the tree. */
export function branchYAt(index: number): number {
  // Closed form of the running sum of riseAt, so the renderer can place a
  // branch without walking the whole tree — the same property gateXAt has.
  const steps = Math.min(index, Math.ceil((RISE_MAX - RISE_START) / RISE_STEP));
  const ramped =
    steps * RISE_START + Math.floor(((steps - 1) * steps * RISE_STEP) / 2);
  return ramped + Math.max(0, index - steps) * RISE_MAX;
}

/** Where branch `index` sits across the trunk, from the course seed. */
export function branchXAt(seed: string, index: number): number {
  const rng = makeRng(seedToInt(seed) ^ Math.imul(index + 1, 0x85ebca6b));
  rng();
  const half = branchHalfWidthAt(index);
  return between(rng, half, Math.max(half, FIELD_W - half));
}

export interface TreeClimbState {
  seed: string;
  x: number;
  y: number;
  vy: number;
  /** The direction being held: -1, 0 or 1. Changed only by an input. */
  lean: number;
  /** Sideways velocity, which the lean pushes and friction pulls back. */
  vx: number;
  /** The highest branch landed on. This is the score. */
  reached: number;
  /** The branch last landed on. */
  lastLanded: number;
  /** Landings since the climb last got higher. See the note in `step`. */
  restingOn: number;
  /** The highest the climber has ever been. The kill line trails it. */
  peak: number;
  /** How high the kill line has been dragged; falling below it ends it. */
  floor: number;
  dead: boolean;
  waiting: boolean;
}

/** Branch 0 is the one the climber starts on, so the first bounce is free. */
const START_INDEX = 0;

export const treeClimbSim: ArcadeSim<TreeClimbState> = {
  start: (seed) => ({
    seed,
    x: branchXAt(seed, START_INDEX),
    // Standing on it, exactly where a bounce puts you back down.
    y: branchYAt(START_INDEX) + BRANCH_HALF_H + HALF_H,
    vy: 0,
    lean: 0,
    vx: 0,
    reached: 0,
    lastLanded: START_INDEX,
    restingOn: 0,
    peak: branchYAt(START_INDEX) + BRANCH_HALF_H + HALF_H,
    floor: 0,
    dead: false,
    waiting: true,
  }),

  step: (state, code) => {
    if (state.dead) return state;

    // Same courtesy as the bird: nothing happens until the player leans.
    // A release does not start a climb — only a direction does.
    if (state.waiting) {
      if (code !== 1 && code !== 2) return state;
      return {
        ...state,
        waiting: false,
        lean: code === 1 ? -1 : 1,
        vy: BOUNCE_VELOCITY,
      };
    }

    // 0 is "no input this tick", so the held direction persists; 3 is the
    // player actually letting go.
    const lean =
      code === 1 ? -1 : code === 2 ? 1 : code === 3 ? 0 : state.lean;

    let vx = state.vx;
    if (lean === 0) {
      // Coast to a stop rather than stopping dead, and never overshoot
      // through zero into a drift the other way.
      vx = vx > 0 ? Math.max(0, vx - LEAN_FRICTION) : Math.min(0, vx + LEAN_FRICTION);
    } else {
      vx = Math.max(
        -MAX_LEAN_SPEED,
        Math.min(MAX_LEAN_SPEED, vx + lean * LEAN_ACCEL),
      );
    }

    // Wrapping rather than walls. A climber that stuck to the edge of the
    // trunk would turn a mistimed lean into a dead end; going round the
    // trunk and coming back is both kinder and truer to climbing a tree.
    let x = state.x + vx;
    if (x < 0) x += FIELD_W;
    if (x >= FIELD_W) x -= FIELD_W;

    // Up-positive: gravity subtracts, and the fall is clamped at the
    // NEGATIVE terminal velocity.
    const vy = Math.max(-TERMINAL_FALL, state.vy - GRAVITY);
    const y = state.y + vy;

    // Landing is only possible on the way down, which is what makes a
    // branch something you drop onto rather than something you clip.
    let bounced = false;
    let landedOn = state.lastLanded;
    let reached = state.reached;
    if (vy < 0) {
      // Only branches near the climber can be met, so this is a short scan
      // rather than a search: the one below, the one level with it, and
      // the next two up.
      for (let index = Math.max(0, reached - 1); index <= reached + 3; index += 1) {
        const branchY = branchYAt(index);
        const top = branchY + BRANCH_HALF_H;
        // Crossed the branch's top surface during this tick.
        if (state.y - HALF_H >= top && y - HALF_H <= top) {
          const branchX = branchXAt(state.seed, index);
          if (Math.abs(x - branchX) <= branchHalfWidthAt(index) + HALF_W) {
            bounced = true;
            landedOn = index;
            reached = Math.max(reached, index);
            break;
          }
        }
      }
    }

    // **A branch will not hold you if you are not going anywhere.**
    //
    // Without this the game does not end. A climber that lands back where
    // it launched returns to the same place next bounce, so one tap and
    // then nothing at all bounced in place for the full twenty-minute tick
    // budget: a run that never finished, never scored and never submitted.
    // A browser probe found it by flailing; a simulation confirmed a
    // single tap was enough.
    //
    // The rule is about PROGRESS rather than about which branch. A first
    // attempt keyed on "the same branch three times running" still left a
    // climber oscillating between two branches alive for ever — the shape
    // is "not getting higher", and that is what this counts. Six landings
    // of slack is about four seconds of fumbling, which is plenty to
    // recover a bad bounce and far too few to settle in.
    const climbed = reached > state.reached;
    const restingOn = climbed ? 0 : bounced ? state.restingOn + 1 : state.restingOn;
    const gaveWay = bounced && !climbed && restingOn > IDLE_LANDINGS;
    if (gaveWay) bounced = false;

    // The kill line only ever rises, and it trails the highest the climber
    // has ACTUALLY been rather than the last branch landed on — a long
    // bounce that clears three branches should count for the height it
    // reached. Dropping back a branch or two is fine and costs nothing;
    // dropping past the line is the end, which is the rule that makes up
    // the only direction that matters.
    const peak = Math.max(state.peak, y);
    const floor = Math.max(state.floor, peak - FALL_LIMIT);
    const dead = y + HALF_H < floor;

    return {
      ...state,
      x,
      y: bounced ? branchYAt(landedOn) + BRANCH_HALF_H + HALF_H : y,
      vy: bounced ? BOUNCE_VELOCITY : vy,
      lean,
      vx,
      reached,
      lastLanded: landedOn,
      // Deliberately NOT reset when a branch gives way — only climbing
      // resets it. Handing back a fresh allowance each time one broke let
      // a climber ping-pong between two branches for ever: six landings,
      // give way, drop one branch, six more, bounce back up. Once you
      // have stopped getting higher, nothing holds you.
      restingOn,
      peak,
      floor,
      dead,
    };
  },

  ended: (state) => state.dead,
  score: (state) => state.reached,
};
