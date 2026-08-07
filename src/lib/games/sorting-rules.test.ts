import { describe, expect, it } from "vitest";
import {
  applyPlacement,
  CLEARED_DECK_BONUS,
  DECK_SIZE,
  emptyBoard,
  isStuck,
  replay,
  SHELF_CAPACITY,
  SHELF_COUNT,
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
    const moves = [0, 1, 2, 3, 4, 0, 1, 2, 3, 4];
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
    // Fill every shelf with a deck that never makes a run.
    const flat = Array.from({ length: DECK_SIZE }, (_, i) =>
      i % 2 === 0 ? "rope" : "tin",
    ) as SortKind[];
    const moves: number[] = [];
    for (let i = 0; i < SHELF_COUNT * SHELF_CAPACITY; i++) {
      moves.push(i % SHELF_COUNT);
    }
    moves.push(0); // one past the end
    const outcome = replay(flat, moves);
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
