/**
 * When each of the Fortune Engine's drums stops turning. PURE — no DOM,
 * no clock, no React.
 *
 * A drum's spin is two phases, and the split is the whole point:
 *
 * 1. **The loop.** A short strip of filler, repeated, translating at a
 *    constant speed. This is where nearly all of the time goes, and it
 *    looks like a drum turning because it is going at one speed and never
 *    slowing.
 * 2. **The settle.** A single decelerating run-in onto the faces the
 *    server stopped on.
 *
 * The alternative — one long decelerating travel — is what this replaced,
 * and it does not survive being made longer. Easing a fixed distance over
 * ten seconds means the reel crawls the whole way and is visibly slowing
 * from the first frame. A player watching that is not watching a drum spin;
 * they are watching a list scroll to a stop.
 *
 * Splitting it also means the strip stays small. Constant-speed motion can
 * be a loop of eight faces repeated, rather than a hundred and twenty
 * cells of DOM per reel to fill ten seconds at the same speed.
 */

/** How long the first drum turns before it starts to slow. */
export const FIRST_LAND_MS = 5_000;

/**
 * And how much later each drum lands than the one before it.
 *
 * Left to right, far enough apart to be three separate events. Two
 * matching symbols on the first two drums now have a real wait attached to
 * them, which is the entire reason a slot machine stops its reels one at
 * a time instead of all at once.
 */
export const STAGGER_MS = 2_500;

/** The decelerating run-in at the end of a drum's spin. */
export const SETTLE_MS = 900;

/** Faces in one turn of the filler loop. */
export const LOOP_FACES = 8;

/**
 * Roughly how long one turn of the loop takes. Adjusted per reel so a
 * whole number of turns fits the spin exactly — see `reelTiming`.
 */
const TARGET_LOOP_MS = 420;

/** When drum `reel` (0-based) comes to rest. */
export function landingMs(reel: number): number {
  return FIRST_LAND_MS + reel * STAGGER_MS;
}

/** When the last of `reels` drums comes to rest, and the pull is over. */
export function lastLandingMs(reels: number): number {
  return landingMs(Math.max(0, reels - 1));
}

export interface ReelTiming {
  /** How long the constant-speed loop runs. */
  spinMs: number;
  /** How long the decelerating run-in onto the result takes. */
  settleMs: number;
  /** One turn of the loop. */
  loopMs: number;
  /** How many turns, always whole — see below. */
  loops: number;
}

/**
 * The two phases for one drum.
 *
 * `loops` is a whole number and `loopMs * loops` is exactly `spinMs`,
 * which matters: the loop ends where the settle begins, and the settle's
 * keyframes start from the loop's end position. A fractional turn would
 * leave the strip part-way through a cycle and the settle would begin by
 * jumping it back to the seam.
 */
export function reelTiming(reel: number): ReelTiming {
  const spinMs = landingMs(reel) - SETTLE_MS;
  const loops = Math.max(1, Math.round(spinMs / TARGET_LOOP_MS));
  return { spinMs, settleMs: SETTLE_MS, loopMs: spinMs / loops, loops };
}
