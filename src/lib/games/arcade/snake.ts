import { between, makeRng, seedToInt, type ArcadeSim } from "./core";

/**
 * The Long Grass (ADR-62). PURE, integer-only.
 *
 * Snake, in a walled plot. Something moves through the grass at a steady
 * crawl and grows every time it finds something to eat; you only choose
 * which way it turns. Meet a wall or your own tail and that is that.
 *
 * The third game on the harness, and the one that proves the harness was
 * worth building: it shares the tick loop, the trace codec, the replay,
 * the run lifecycle, the claim ladder and every anti-cheat rule, and adds
 * a grid.
 *
 * **No fixed-point units here.** The other two games move continuously and
 * need them; this one lives on a lattice, so its positions are cell
 * indices and its arithmetic is already exact. The harness does not care —
 * it asks a simulation to step, end and score, and has no opinion about
 * what is inside.
 *
 * Input codes: 1 up, 2 right, 3 down, 4 left. Code 0 is "nothing happened
 * this tick" and must stay that way, which is the lesson The Long Way Up
 * paid for.
 */

/** The plot, in cells. Portrait, to match the stage. */
export const COLS = 12;
export const ROWS = 15;

/**
 * Ticks between crawls, fastest and slowest.
 *
 * The snake starts at eight ticks a cell — a shade under six cells a
 * second — and speeds up as it grows, to a floor that is still readable on
 * a phone. Speeding up is the whole difficulty curve: the plot never
 * changes and neither does the snake's turning, so the only thing that
 * makes the twentieth apple harder than the second is how long you have to
 * decide.
 */
const START_INTERVAL = 8;
const FLOOR_INTERVAL = 4;
/** Apples eaten per tick shaved off the interval. */
const APPLES_PER_STEP_UP = 4;

/** How long the snake starts. */
const START_LENGTH = 3;

export function intervalAt(eaten: number): number {
  return Math.max(
    FLOOR_INTERVAL,
    START_INTERVAL - Math.floor(eaten / APPLES_PER_STEP_UP),
  );
}

export interface Cell {
  x: number;
  y: number;
}

export interface SnakeState {
  seed: string;
  /** Head first. The last cell is the tail. */
  body: Cell[];
  /** Facing, as a unit step. */
  dx: number;
  dy: number;
  /** Ticks since the last crawl. */
  since: number;
  apple: Cell;
  /** How many apples have been found. This is the score. */
  eaten: number;
  dead: boolean;
  waiting: boolean;
}

/** Where the nth apple goes, given everything the snake is occupying. */
function placeApple(seed: string, index: number, body: readonly Cell[]): Cell {
  const rng = makeRng(seedToInt(seed) ^ Math.imul(index + 1, 0x27d4eb2f));
  rng();
  // Draw a free cell by index rather than by rejection sampling: a
  // rejection loop is unbounded, and an unbounded loop inside a replay the
  // server runs on request is a way to make it work very hard for nothing.
  const taken = new Set(body.map((cell) => cell.y * COLS + cell.x));
  const free = COLS * ROWS - taken.size;
  if (free <= 0) return body[0] as Cell;
  let nth = between(rng, 0, free - 1);
  for (let i = 0; i < COLS * ROWS; i += 1) {
    if (taken.has(i)) continue;
    if (nth === 0) return { x: i % COLS, y: Math.floor(i / COLS) };
    nth -= 1;
  }
  return body[0] as Cell;
}

export const snakeSim: ArcadeSim<SnakeState> = {
  start: (seed) => {
    // Middle of the plot, facing up, with the tail below it. Facing up
    // rather than sideways so the first decision is a turn rather than a
    // wall four cells away.
    const x = Math.floor(COLS / 2);
    const y = Math.floor(ROWS / 2);
    const body: Cell[] = [];
    for (let i = 0; i < START_LENGTH; i += 1) body.push({ x, y: y + i });
    return {
      seed,
      body,
      dx: 0,
      dy: -1,
      since: 0,
      apple: placeApple(seed, 0, body),
      eaten: 0,
      dead: false,
      waiting: true,
    };
  },

  step: (state, code) => {
    if (state.dead) return state;

    // Nothing crawls until the player takes hold of it, the same courtesy
    // the other two games give.
    if (state.waiting) {
      if (code === 0) return state;
      return turn({ ...state, waiting: false, since: 0 }, code);
    }

    const turned = code === 0 ? state : turn(state, code);
    const interval = intervalAt(turned.eaten);
    if (turned.since + 1 < interval) {
      return { ...turned, since: turned.since + 1 };
    }

    const head = turned.body[0] as Cell;
    const next: Cell = { x: head.x + turned.dx, y: head.y + turned.dy };

    // Walls. A plot has a fence; going through it would make this a
    // different game and a much easier one.
    if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) {
      return { ...turned, since: 0, dead: true };
    }

    const eating = next.x === turned.apple.x && next.y === turned.apple.y;
    // The tail cell moves out of the way on the same tick unless the snake
    // is growing, so following your own tail round is legal — which is how
    // the game is actually played once it is long.
    const occupied = eating ? turned.body : turned.body.slice(0, -1);
    if (occupied.some((cell) => cell.x === next.x && cell.y === next.y)) {
      return { ...turned, since: 0, dead: true };
    }

    const body = [next, ...occupied];
    const eaten = eating ? turned.eaten + 1 : turned.eaten;
    return {
      ...turned,
      body,
      since: 0,
      eaten,
      apple: eating ? placeApple(turned.seed, eaten, body) : turned.apple,
    };
  },

  ended: (state) => state.dead,
  score: (state) => state.eaten,
};

/**
 * Applies a turn, refusing the one that would reverse into itself.
 *
 * Classic and load-bearing: a snake longer than one cell that turns back
 * on itself dies instantly to its own neck, which reads as the game
 * cheating rather than as a mistake. Refused rather than fatal.
 */
function turn(state: SnakeState, code: number): SnakeState {
  const [dx, dy] =
    code === 1
      ? [0, -1]
      : code === 2
        ? [1, 0]
        : code === 3
          ? [0, 1]
          : code === 4
            ? [-1, 0]
            : [state.dx, state.dy];
  if (dx === -state.dx && dy === -state.dy && state.body.length > 1) {
    return state;
  }
  return { ...state, dx, dy };
}
