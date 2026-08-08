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
 * Input codes: 0 hands off, 1 lean left, 2 lean right. The trace records
 * the moments the lean CHANGES, so holding a direction for four seconds is
 * one event rather than two hundred.
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

/** Sideways speed while leaning. */
const LEAN_SPEED = 1_150;
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
  /** The lean, held between events: -1, 0 or 1. */
  lean: number;
  /** The highest branch landed on. This is the score. */
  reached: number;
  /** How high the view has been dragged; falling below it ends the climb. */
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
    reached: 0,
    floor: 0,
    dead: false,
    waiting: true,
  }),

  step: (state, code) => {
    if (state.dead) return state;

    // Same courtesy as the bird: nothing happens until the player leans.
    if (state.waiting) {
      if (code === 0) return state;
      return {
        ...state,
        waiting: false,
        lean: code === 1 ? -1 : 1,
        vy: BOUNCE_VELOCITY,
      };
    }

    const lean = code === 0 ? state.lean : code === 1 ? -1 : 1;

    // Wrapping rather than walls. A climber that stuck to the edge of the
    // trunk would turn a mistimed lean into a dead end; going round the
    // trunk and coming back is both kinder and truer to climbing a tree.
    let x = state.x + lean * LEAN_SPEED;
    if (x < 0) x += FIELD_W;
    if (x >= FIELD_W) x -= FIELD_W;

    // Up-positive: gravity subtracts, and the fall is clamped at the
    // NEGATIVE terminal velocity.
    const vy = Math.max(-TERMINAL_FALL, state.vy - GRAVITY);
    const y = state.y + vy;

    // Landing is only possible on the way down, which is what makes a
    // branch something you drop onto rather than something you clip.
    let bounced = false;
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
            reached = Math.max(reached, index);
            break;
          }
        }
      }
    }

    // The view only ever rises. Dropping back onto a lower branch is fine
    // and costs nothing; dropping below what the view has already claimed
    // is the end, which is the rule that makes going up the only direction
    // that matters.
    const floor = Math.max(state.floor, branchYAt(reached) - VIEW_H);
    const dead = y + HALF_H < floor;

    return {
      ...state,
      x,
      y: bounced ? branchYAt(reached) + BRANCH_HALF_H + HALF_H : y,
      vy: bounced ? BOUNCE_VELOCITY : vy,
      lean,
      reached,
      floor,
      dead,
    };
  },

  ended: (state) => state.dead,
  score: (state) => state.reached,
};
