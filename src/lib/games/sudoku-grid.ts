/**
 * Sudoku grid arithmetic. PURE — shared by the server (which adjudicates)
 * and the client (which highlights conflicts as you type).
 *
 * A grid is 81 characters, '1'-'9' for a filled cell and '.' for a blank.
 * That representation is the whole reason this module is small: rows,
 * columns and boxes are index arithmetic, and there is no board object to
 * keep in sync with anything.
 *
 * **This module never sees the solution.** Conflict detection — a repeat
 * in a row, column, or box — needs no solution at all, which is what lets
 * the client mark mistakes instantly without the server handing over the
 * answer one cell at a time.
 */

export const GRID_SIZE = 81;
export const ROW_LENGTH = 9;

export function indexOf(row: number, column: number): number {
  return row * ROW_LENGTH + column;
}

export function rowOf(index: number): number {
  return Math.floor(index / ROW_LENGTH);
}

export function columnOf(index: number): number {
  return index % ROW_LENGTH;
}

/** 0-8, reading left to right then top to bottom. */
export function boxOf(index: number): number {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(columnOf(index) / 3);
}

/** True for exactly 81 characters of digits and dots. */
export function isGridShape(grid: string): boolean {
  return grid.length === GRID_SIZE && /^[1-9.]{81}$/.test(grid);
}

/** Every index that shares a row, column, or box with this one. */
export function peersOf(index: number): number[] {
  const peers = new Set<number>();
  const row = rowOf(index);
  const column = columnOf(index);
  const box = boxOf(index);
  for (let i = 0; i < GRID_SIZE; i++) {
    if (i === index) continue;
    if (rowOf(i) === row || columnOf(i) === column || boxOf(i) === box) {
      peers.add(i);
    }
  }
  return [...peers];
}

/**
 * Indices holding a digit that repeats among its peers.
 *
 * Both members of a clash are reported, not just the later one: a player
 * who typed a 7 that clashes with a given wants to see the given light up
 * too, otherwise the highlight looks like the game disagreeing with a
 * cell they cannot change.
 */
export function conflictingCells(grid: string): number[] {
  const conflicts = new Set<number>();
  for (let i = 0; i < GRID_SIZE; i++) {
    const value = grid[i];
    if (value === undefined || value === ".") continue;
    for (const peer of peersOf(i)) {
      if (grid[peer] === value) {
        conflicts.add(i);
        conflicts.add(peer);
      }
    }
  }
  return [...conflicts].sort((a, b) => a - b);
}

/** True when every cell holds a digit. Says nothing about correctness. */
export function isComplete(grid: string): boolean {
  return isGridShape(grid) && !grid.includes(".");
}

/**
 * The player's entries with the puzzle's givens re-imposed over the top.
 *
 * Load-bearing, and the reason the server can accept an entry string from
 * a browser at all: a forged entry over a given cell is silently discarded
 * here, so the only thing a client can actually change is a blank.
 */
export function withGivens(givens: string, entries: string): string {
  let out = "";
  for (let i = 0; i < GRID_SIZE; i++) {
    const given = givens[i] ?? ".";
    out += given !== "." ? given : (entries[i] ?? ".");
  }
  return out;
}

/** Blank grid, for a player who has not started. */
export const EMPTY_GRID = ".".repeat(GRID_SIZE);
