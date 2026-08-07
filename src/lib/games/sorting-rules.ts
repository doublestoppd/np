/**
 * The Sorting Bench: pure rules, shared by the client and the server.
 *
 * This module is the ONLY implementation of how a placement resolves. The
 * browser imports it to show the board moving as you tap; the server
 * imports it to decide what actually happened. Two implementations would
 * drift, and the one that drifts is always the one nobody is checking.
 *
 * Nothing here reads a clock, a database, or a random number. The deck is
 * shuffled server-side (src/server/modules/games/sorting/deck.ts) and
 * never leaves it, so a board can be replayed from a seed and a list of
 * moves and cannot be replayed from anything a client holds.
 */

/**
 * What comes up off the flats. Five kinds, distinguished by glyph and by
 * name as well as by colour — colour is never the only signal.
 */
export const SORT_KINDS = ["rope", "tin", "glass", "cork", "bone"] as const;
export type SortKind = (typeof SORT_KINDS)[number];

/**
 * FEWER SHELVES THAN KINDS. This inequality is the game.
 *
 * The bench first shipped with five shelves and five kinds, and that
 * equality was a defect: "shelf i is always for kind i" is a mapping that
 * needs no decision, no counting and no look-ahead, and because twelve
 * copies divides evenly by a run of three, it cleared the entire deck for
 * the maximum score on 100% of simulated seeds. The top payout was paid
 * every time, to a player who never chose anything.
 *
 * With four shelves and five kinds no such mapping exists. Some kind is
 * always homeless, so every find is a question about what to bury under
 * what — and a buried find cannot come back until the run above it goes,
 * because a placement only ever resolves the run at the top of a shelf.
 *
 * Simulation over 5000 seeded decks, playing only from what a client can
 * see (board, find in hand, shallow preview):
 *
 *   strategy                median   p90   top payout   cleared deck
 *   fixed shelf-per-kind      2880   3460      0.3%          95%
 *   greedy (stack alike)      3170   3850      7.9%          99%
 *   searching the preview     3560   3950     11.4%         100%
 *
 * SHELF_CAPACITY stays at 6. Tightening it was measured and rejected: at
 * 5 the reach rates from 3500 upward are unchanged, so it takes nothing
 * from good play and only removes the bottom rungs from a first-timer,
 * and at 4 the game turns punishing — even the searching player loses the
 * deck 42% of the time. Room is what lets a beginner finish a run; the
 * shelf count is what makes the run worth thinking about.
 */
export const SHELF_COUNT = 4;
export const SHELF_CAPACITY = 6;

/**
 * Twelve of each kind, so the deck is finite and countable. Knowing what
 * is left is a real but modest edge — measured against a player who
 * ignores it entirely, tracking the remaining counts is worth about 40
 * points of mean score, mostly late in the deck when a kind runs out and
 * the shelf holding it becomes dead weight. It is not what makes this a
 * game of skill; the shelf count is.
 */
export const COPIES_PER_KIND = 12;
export const DECK_SIZE = SORT_KINDS.length * COPIES_PER_KIND;

/** How many finds are visible ahead of the current one. */
export const PREVIEW_DEPTH = 2;

/** Most placements a single submission may carry. */
export const MAX_BATCH = 5;

/**
 * A run of this many alike is boxed up and taken away. Three divides
 * twelve, so a kind can always be cleared away completely — the thing
 * that makes a perfect run possible at all, and the reason this stays at
 * three unless the deck composition changes with it.
 */
export const RUN_LENGTH = 3;

const RUN_BASE_SCORE = 10;
const EMPTY_SHELF_BONUS = 100;
export const CLEARED_DECK_BONUS = 250;

/** Shelves, each filled left to right. Nothing floats. */
export type SortBoard = SortKind[][];

export function emptyBoard(): SortBoard {
  return Array.from({ length: SHELF_COUNT }, () => []);
}

export function isLegalPlacement(board: SortBoard, shelfIndex: number): boolean {
  const shelf = board[shelfIndex];
  return shelf !== undefined && shelf.length < SHELF_CAPACITY;
}

/** True when nothing on the board can take another find. */
export function isStuck(board: SortBoard): boolean {
  return board.every((shelf) => shelf.length >= SHELF_CAPACITY);
}

export interface PlacementOutcome {
  board: SortBoard;
  /** Points from this placement, including every cascade step. */
  scored: number;
  /** Runs cleared, in order. Length is the chain depth. */
  clears: Array<{ kind: SortKind; length: number; points: number }>;
  /** The shelf ended the placement empty. */
  emptiedShelf: boolean;
}

/**
 * Places one find and resolves everything that follows, deterministically.
 *
 * Resolution order is fixed and total, because the server has to be able
 * to reproduce it exactly: find the maximal run containing the new find,
 * clear it, compact the shelf left, then rescan THE SAME SHELF and clear
 * the leftmost eligible run, at an incremented multiplier, until none
 * remain. Cascades never cross shelves — that keeps a placement's
 * consequences local enough to plan around.
 *
 * Throws on an illegal placement rather than silently ignoring it: the
 * server treats an illegal move as a voided run, and a rule that quietly
 * did nothing would hide that.
 */
export function applyPlacement(
  board: SortBoard,
  kind: SortKind,
  shelfIndex: number,
): PlacementOutcome {
  if (!isLegalPlacement(board, shelfIndex)) {
    throw new Error(`illegal placement on shelf ${shelfIndex}`);
  }

  const next: SortBoard = board.map((shelf) => [...shelf]);
  const shelf = next[shelfIndex] as SortKind[];
  shelf.push(kind);

  const clears: PlacementOutcome["clears"] = [];
  let scored = 0;
  let chain = 1;

  // The first clear must contain the find just placed; later ones are
  // whatever compaction brought together.
  let range = runContaining(shelf, shelf.length - 1);
  while (range) {
    const length = range.end - range.start + 1;
    const cleared = shelf[range.start] as SortKind;
    const points = length * length * RUN_BASE_SCORE * chain;
    scored += points;
    clears.push({ kind: cleared, length, points });
    shelf.splice(range.start, length);
    chain += 1;
    range = leftmostRun(shelf);
  }

  const emptiedShelf = clears.length > 0 && shelf.length === 0;
  if (emptiedShelf) {
    scored += EMPTY_SHELF_BONUS;
  }

  return { board: next, scored, clears, emptiedShelf };
}

/** The maximal run of alike neighbours around `index`, if long enough. */
function runContaining(
  shelf: SortKind[],
  index: number,
): { start: number; end: number } | null {
  const kind = shelf[index];
  if (kind === undefined) {
    return null;
  }
  let start = index;
  while (start > 0 && shelf[start - 1] === kind) {
    start -= 1;
  }
  let end = index;
  while (end < shelf.length - 1 && shelf[end + 1] === kind) {
    end += 1;
  }
  return end - start + 1 >= RUN_LENGTH ? { start, end } : null;
}

/** The leftmost eligible run anywhere on the shelf, if any. */
function leftmostRun(shelf: SortKind[]): { start: number; end: number } | null {
  let start = 0;
  while (start < shelf.length) {
    let end = start;
    while (end < shelf.length - 1 && shelf[end + 1] === shelf[start]) {
      end += 1;
    }
    if (end - start + 1 >= RUN_LENGTH) {
      return { start, end };
    }
    start = end + 1;
  }
  return null;
}

export interface ReplayOutcome {
  board: SortBoard;
  score: number;
  /** Finds consumed. Equal to moves.length unless the run ended early. */
  placed: number;
  /** The deck ran out — every find was sorted. */
  cleared: boolean;
  /** No shelf could take the next find. */
  stuck: boolean;
}

/**
 * Replays a whole run from its deck and its move log. This is how the
 * server knows a score: it is derived, never received.
 *
 * Stops early and reports `stuck` when the next find has nowhere to go,
 * so a batch submitted past a bust is truncated rather than rejected —
 * busting mid-batch is ordinary play, not cheating.
 */
export function replay(deck: readonly SortKind[], moves: readonly number[]): ReplayOutcome {
  let board = emptyBoard();
  let score = 0;
  let placed = 0;

  for (const shelfIndex of moves) {
    if (placed >= deck.length) {
      break;
    }
    if (isStuck(board)) {
      return { board, score, placed, cleared: false, stuck: true };
    }
    const outcome = applyPlacement(board, deck[placed] as SortKind, shelfIndex);
    board = outcome.board;
    score += outcome.scored;
    placed += 1;
  }

  const cleared = placed >= deck.length;
  if (cleared) {
    score += CLEARED_DECK_BONUS;
  }
  return {
    board,
    score,
    placed,
    cleared,
    stuck: !cleared && isStuck(board),
  };
}
