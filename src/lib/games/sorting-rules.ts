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

export const SHELF_COUNT = 5;
export const SHELF_CAPACITY = 6;

/** Twelve of each kind: a finite deck, so counting is a real skill. */
export const COPIES_PER_KIND = 12;
export const DECK_SIZE = SORT_KINDS.length * COPIES_PER_KIND;

/** How many finds are visible ahead of the current one. */
export const PREVIEW_DEPTH = 2;

/** Most placements a single submission may carry. */
export const MAX_BATCH = 5;

/** A run of this many alike is boxed up and taken away. */
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
