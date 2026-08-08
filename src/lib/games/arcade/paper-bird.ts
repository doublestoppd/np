import {
  between,
  makeRng,
  seedToInt,
  UNIT,
  type ArcadeSim,
} from "./core";

/**
 * The Paper Bird (ADR-62). PURE, integer-only.
 *
 * A folded paper bird on the updraught below Windward Steps. It falls
 * steadily; one beat of the wings pushes it up. Between it and the bottom
 * of the fell are gaps in the drystone walls, and the whole game is
 * threading them.
 *
 * Everything below is in fixed-point units (`UNIT` = 1000). The world is
 * `FIELD_H` tall and scrolls sideways at a constant speed, so horizontal
 * position is just the tick count — which is why a gate's position can be
 * computed from its index without simulating anything, and why the
 * renderer can draw a gate long before the bird reaches it.
 */

/** The playing field, in world units. Height only; width is time. */
export const FIELD_H = 200 * UNIT;

/** Downward pull per tick, and the upward kick of one wingbeat. */
const GRAVITY = 62;
const BEAT_VELOCITY = -1_150;
/** Falling any faster than this just looks broken, so it is clamped. */
const TERMINAL_VELOCITY = 1_900;

/** How far the field scrolls per tick. */
const SCROLL = 1_300;

/** Ticks between one wall and the next, at the scroll speed above. */
const GATE_TICKS = 62;

/**
 * Ticks of open air before the first wall.
 *
 * Not decoration. Without it the first wall arrived seven ticks after the
 * bird started — a seventh of a second — and since a gap may sit anywhere
 * across the field, roughly a third of all seeds opened with a wall the
 * bird could not physically reach. Two of six test seeds scored zero no
 * matter how well the run was played. A hundred ticks is two seconds of
 * getting your bearings, which is what the first wall should cost.
 */
const LEAD_IN_TICKS = 100;

/**
 * The bird's size — the DRAWN size, in world units, and the renderer draws
 * from these rather than from pixel numbers of its own.
 *
 * That link is the point. The first version had a hitbox of 5 units
 * (11.5px on a 360px stage) against a bird drawn 7px tall: the box was
 * 64% bigger than the picture, so it clipped walls it visibly cleared.
 * Nothing connected the two numbers, so nothing could notice.
 */
export const BIRD_HALF_W = 5 * UNIT;
export const BIRD_HALF_H = 4 * UNIT;

/**
 * How much of the bird actually collides, in percent.
 *
 * Inside the drawing rather than equal to it, which is ordinary practice
 * in this genre and the right direction to err: a death the player can see
 * coming is fair, and a death from the corner of a bounding box around a
 * pointed paper triangle is not. The bird is a triangle; its box is not.
 */
const HITBOX_PCT = 80;
const HIT_HALF_W = Math.floor((BIRD_HALF_W * HITBOX_PCT) / 100);
const HIT_HALF_H = Math.floor((BIRD_HALF_H * HITBOX_PCT) / 100);

/** Where the bird sits horizontally. Fixed; the world moves past it. */
export const BIRD_X = 60 * UNIT;

/**
 * The gap in a wall: wide at first, narrowing to a floor.
 *
 * Narrowing is what stops the game being endless in the boring sense — a
 * constant gap means a competent player never dies and the run ends when
 * their thumb does. The floor means it stops getting harder well before it
 * gets unfair.
 */
const GAP_START = 62 * UNIT;
const GAP_FLOOR = 40 * UNIT;
const GAP_STEP = UNIT;

/** Clear of the ceiling and the floor, so no gate is a coin flip. */
const GAP_MARGIN = 26 * UNIT;

export function gapHeightAt(index: number): number {
  return Math.max(GAP_FLOOR, GAP_START - index * GAP_STEP);
}

/** The centre of gate `index`, drawn from the course seed. */
export function gapCentreAt(seed: string, index: number): number {
  // Seeded per gate rather than by walking a generator forward, so the
  // renderer can draw gate 40 without having generated gates 1..39.
  const rng = makeRng(seedToInt(seed) ^ Math.imul(index + 1, 0x9e3779b9));
  rng();
  const half = gapHeightAt(index) / 2;
  const low = Math.floor(GAP_MARGIN + half);
  const high = Math.floor(FIELD_H - GAP_MARGIN - half);
  return between(rng, low, Math.max(low, high));
}

/** The x of gate `index`, in world units. */
export function gateXAt(index: number): number {
  return BIRD_X + (LEAD_IN_TICKS + index * GATE_TICKS) * SCROLL;
}

/** Half the thickness of a wall, for collision and for drawing. */
export const WALL_HALF_W = 7 * UNIT;

export interface PaperBirdState {
  seed: string;
  /** How far the world has scrolled. */
  x: number;
  y: number;
  vy: number;
  /** Gates fully behind the bird. This is the score. */
  passed: number;
  dead: boolean;
  /** True until the first wingbeat: the bird hangs, so nobody is ambushed. */
  waiting: boolean;
}

export const paperBirdSim: ArcadeSim<PaperBirdState> = {
  start: (seed) => ({
    seed,
    x: 0,
    y: Math.floor(FIELD_H / 2),
    vy: 0,
    passed: 0,
    dead: false,
    waiting: true,
  }),

  step: (state, code) => {
    if (state.dead) return state;

    // Nothing moves until the player commits. A game that starts falling
    // the instant it renders punishes the half-second it takes to look at
    // it, and this one is played on a phone in a queue.
    if (state.waiting) {
      if (code !== 1) return state;
      return { ...state, waiting: false, vy: BEAT_VELOCITY };
    }

    const vy =
      code === 1
        ? BEAT_VELOCITY
        : Math.min(TERMINAL_VELOCITY, state.vy + GRAVITY);
    const y = state.y + vy;
    const x = state.x + SCROLL;

    // The ceiling is solid, like the floor. A bird that could rest against
    // the top edge would make the whole game a matter of holding the
    // button, which is not a game.
    if (y - HIT_HALF_H <= 0 || y + HIT_HALF_H >= FIELD_H) {
      return { ...state, x, y, vy, dead: true };
    }

    // Only the next wall can be hit — walls are further apart than the
    // bird is wide — so exactly one overlap test per tick.
    const index = state.passed;
    const gateX = gateXAt(index);
    const birdLeft = BIRD_X + x - HIT_HALF_W;
    const birdRight = BIRD_X + x + HIT_HALF_W;
    const overlapping =
      birdRight >= gateX - WALL_HALF_W && birdLeft <= gateX + WALL_HALF_W;
    if (overlapping) {
      const centre = gapCentreAt(state.seed, index);
      const half = gapHeightAt(index) / 2;
      if (y - HIT_HALF_H < centre - half || y + HIT_HALF_H > centre + half) {
        return { ...state, x, y, vy, dead: true };
      }
    }

    // Cleared once the wall is wholly behind.
    const passed = birdLeft > gateX + WALL_HALF_W ? index + 1 : index;
    return { ...state, x, y, vy, passed };
  },

  ended: (state) => state.dead,
  score: (state) => state.passed,
};
