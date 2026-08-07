import { describe, expect, it } from "vitest";
import {
  applyPlacement,
  CLEARED_DECK_BONUS,
  COPIES_PER_KIND,
  DECK_SIZE,
  emptyBoard,
  isLegalPlacement,
  isStuck,
  replay,
  SHELF_CAPACITY,
  SHELF_COUNT,
  SORT_KINDS,
  type SortBoard,
  type SortKind,
} from "./sorting-rules";

/**
 * The rules are pure, and they are the shared implementation the client
 * animates with and the server adjudicates with. If these hold, the two
 * cannot disagree about what a placement did.
 */
describe("applyPlacement", () => {
  it("appends to the right end of a shelf and leaves the others alone", () => {
    const outcome = applyPlacement(emptyBoard(), "rope", 2);
    expect(outcome.board[2]).toEqual(["rope"]);
    expect(outcome.board[0]).toEqual([]);
    expect(outcome.scored).toBe(0);
    expect(outcome.clears).toEqual([]);
  });

  it("does not mutate the board it was given", () => {
    const before = emptyBoard();
    applyPlacement(before, "tin", 0);
    expect(before[0]).toEqual([]);
  });

  it("clears three alike and scores length squared", () => {
    let board = emptyBoard();
    board = applyPlacement(board, "glass", 0).board;
    board = applyPlacement(board, "glass", 0).board;
    const outcome = applyPlacement(board, "glass", 0);
    expect(outcome.board[0]).toEqual([]);
    // 3² × 10 × chain 1, plus the empty-shelf bonus.
    expect(outcome.scored).toBe(90 + 100);
    expect(outcome.clears).toEqual([{ kind: "glass", length: 3, points: 90 }]);
    expect(outcome.emptiedShelf).toBe(true);
  });

  it("clears a longer run whole, and scores it superlinearly", () => {
    // Hand-built to three, so the placement makes it four: a run only
    // ever resolves at the moment it is completed, so a four cannot
    // arise from ordinary play without being built this way.
    const board = emptyBoard();
    board[1] = ["cork", "cork", "cork"];
    const outcome = applyPlacement(board, "cork", 1);
    // 4² × 10 beats two separate threes (2 × 3² × 10), which is the
    // reason to hold a run rather than bank it early.
    expect(outcome.clears[0]).toEqual({ kind: "cork", length: 4, points: 160 });
  });

  it("cascades on the same shelf, at a rising multiplier", () => {
    // bone bone rope rope rope | + rope → rope run clears, the bones meet.
    const board = emptyBoard();
    board[0] = ["bone", "bone", "rope", "rope"];
    const outcome = applyPlacement(board, "rope", 0);
    expect(outcome.clears).toEqual([
      { kind: "rope", length: 3, points: 90 },
    ]);
    // Only two bones remain, so the chain stops rather than clearing them.
    expect(outcome.board[0]).toEqual(["bone", "bone"]);

    const chained = emptyBoard();
    chained[0] = ["bone", "bone", "bone", "rope", "rope"];
    const second = applyPlacement(chained, "rope", 0);
    expect(second.clears).toHaveLength(2);
    // First the rope at chain 1, then the bones compact together at 2.
    expect(second.clears[0]).toEqual({ kind: "rope", length: 3, points: 90 });
    expect(second.clears[1]).toEqual({ kind: "bone", length: 3, points: 180 });
    expect(second.emptiedShelf).toBe(true);
  });

  it("refuses a full shelf and an index off the board", () => {
    const board = emptyBoard();
    // Hand-built past the clear threshold on purpose: the rule under test
    // is capacity, not resolution.
    board[3] = Array.from({ length: SHELF_CAPACITY }, () => "tin" as SortKind);
    expect(() => applyPlacement(board, "rope", 3)).toThrow();
    expect(() => applyPlacement(emptyBoard(), "rope", SHELF_COUNT)).toThrow();
    expect(() => applyPlacement(emptyBoard(), "rope", -1)).toThrow();
  });
});

describe("isStuck", () => {
  it("is true only when every shelf is full", () => {
    const board = emptyBoard();
    expect(isStuck(board)).toBe(false);
    for (let shelf = 0; shelf < SHELF_COUNT; shelf++) {
      board[shelf] = Array.from(
        { length: SHELF_CAPACITY },
        () => "tin" as SortKind,
      );
    }
    expect(isStuck(board)).toBe(true);
  });
});

describe("replay", () => {
  const deck = Array.from({ length: DECK_SIZE }, (_, i) =>
    (["rope", "tin", "glass", "cork", "bone"] as const)[i % 5],
  ) as SortKind[];

  it("derives the same score as placing one at a time", () => {
    const moves = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1];
    const replayed = replay(deck, moves);

    let board = emptyBoard();
    let score = 0;
    moves.forEach((shelf, index) => {
      const outcome = applyPlacement(board, deck[index] as SortKind, shelf);
      board = outcome.board;
      score += outcome.scored;
    });
    expect(replayed.score).toBe(score);
    expect(replayed.board).toEqual(board);
    expect(replayed.placed).toBe(moves.length);
  });

  it("stops at a bust rather than throwing, and reports it", () => {
    // Deal the five kinds round-robin onto four shelves. The counts are
    // coprime, so each shelf receives five different kinds in a row and
    // no run ever forms — the board fills up solid.
    const moves: number[] = [];
    for (let i = 0; i < SHELF_COUNT * SHELF_CAPACITY; i++) {
      moves.push(i % SHELF_COUNT);
    }
    moves.push(0); // one past the end
    const outcome = replay(deck, moves);
    expect(outcome.stuck).toBe(true);
    expect(outcome.cleared).toBe(false);
    expect(outcome.placed).toBe(SHELF_COUNT * SHELF_CAPACITY);
  });

  it("pays the clearing bonus only when the deck actually runs out", () => {
    const short = replay(deck, [0, 1, 2]);
    expect(short.cleared).toBe(false);

    // A deck of one, placed once.
    const tiny = replay([deck[0] as SortKind], [0]);
    expect(tiny.cleared).toBe(true);
    expect(tiny.score).toBe(CLEARED_DECK_BONUS);
  });

  it("ignores moves past the end of the deck", () => {
    const tiny = replay([deck[0] as SortKind], [0, 1, 2]);
    expect(tiny.placed).toBe(1);
  });
});

/**
 * The regression that made this a game, guarded so it cannot come back.
 *
 * The bench shipped with SHELF_COUNT equal to SORT_KINDS.length. That
 * equality was the whole defect: "shelf i is always for kind i" is a
 * mapping that needs no decision, no counting and no look-ahead, and
 * since twelve copies divides evenly by a run of three it emptied every
 * shelf every time. Simulated over 5000 seeds it scored exactly 4050 on
 * 100% of them — above the top payout tier, every run, forever.
 *
 * These tests fail if that is ever true again.
 */
describe("the trivial fixed-mapping strategy", () => {
  /**
   * The top of SORTING_TIERS in src/server/modules/games/sorting/config.ts.
   * Duplicated as a literal rather than imported because src/lib may not
   * depend on src/server; a test in that module asserts the trivial
   * strategy stays under the real tier table, so the two cannot drift
   * apart silently.
   */
  const TOP_PAYOUT_TIER = 3_900;

  /**
   * A deterministic shuffle, local to this file so these pure rules keep
   * no dependency on the server. It is not the server's shuffle — that
   * one is SHA-256 keyed and server-only — but it deals the same fixed
   * composition, which is all a claim about strategy needs.
   */
  function shuffledDeck(seed: number): SortKind[] {
    const deck: SortKind[] = [];
    for (const kind of SORT_KINDS) {
      for (let i = 0; i < COPIES_PER_KIND; i++) {
        deck.push(kind);
      }
    }
    let state = (seed + 1) >>> 0;
    const next = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
    };
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const swap = deck[i] as SortKind;
      deck[i] = deck[j] as SortKind;
      deck[j] = swap;
    }
    return deck;
  }

  /**
   * Shelf i is always for kind i. Where a kind has no home shelf it falls
   * back as generously as possible — onto a shelf already showing that
   * kind, otherwise the shortest one — so this is the strongest version
   * of "make no decisions", not a straw man.
   */
  function playFixedMapping(deck: readonly SortKind[]): number {
    let board: SortBoard = emptyBoard();
    const moves: number[] = [];

    for (const kind of deck) {
      const home = SORT_KINDS.indexOf(kind);
      let chosen =
        home < SHELF_COUNT && isLegalPlacement(board, home) ? home : null;

      if (chosen === null) {
        for (let i = 0; i < SHELF_COUNT; i++) {
          if (!isLegalPlacement(board, i)) continue;
          const shelf = board[i] as SortKind[];
          if (shelf[shelf.length - 1] === kind) {
            chosen = i;
            break;
          }
          if (
            chosen === null ||
            shelf.length < (board[chosen] as SortKind[]).length
          ) {
            chosen = i;
          }
        }
      }
      if (chosen === null) break; // Nowhere left: the run is over.

      board = applyPlacement(board, kind, chosen).board;
      moves.push(chosen);
    }
    // Scored the way the server scores it, from the deck and the moves.
    return replay(deck, moves).score;
  }

  it("has no shelf of its own for every kind", () => {
    // Equality here is what made the game trivial: with a shelf per kind
    // nothing ever has to be buried, so there is nothing to decide.
    expect(SHELF_COUNT).toBeLessThan(SORT_KINDS.length);
  });

  it("never reaches the top payout tier, on any of these seeds", () => {
    const scores = Array.from({ length: 64 }, (_, seed) =>
      playFixedMapping(shuffledDeck(seed)),
    );

    // THE assertion. Restore SHELF_COUNT to SORT_KINDS.length and every
    // one of these decks scores 4050 — a clean sweep of the top tier — so
    // this fails loudly rather than subtly. Measured margin today: the
    // best of the 64 is 3650, a full tier short.
    expect(Math.max(...scores)).toBeLessThan(TOP_PAYOUT_TIER);

    // And it is not merely short of the top; it is unremarkable play.
    // The mean is stable across seed counts at a shade under 2900.
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    expect(mean).toBeLessThan(3_200);

    // A perfect run empties a shelf on all twenty clears. Making no
    // decisions must never do that; it used to do it every time.
    const perfect = DECK_SIZE * 30 + CLEARED_DECK_BONUS + 20 * 100;
    expect(Math.max(...scores)).toBeLessThan(perfect);
  });
});
