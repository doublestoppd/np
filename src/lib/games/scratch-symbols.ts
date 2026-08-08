/**
 * The marks under the salt. PURE — shared by the server (which draws
 * them) and the client (which renders them).
 *
 * A scratch card is three marks. Three the same pays; anything else does
 * not. Two the same is a near miss, and near misses are deliberately
 * common (ADR-48) — they are most of what a losing card feels like, and a
 * losing card that shows three unrelated marks feels like nothing at all.
 */

export const SCRATCH_SYMBOLS = [
  { key: "0", glyph: "🜁", name: "Air" },
  { key: "1", glyph: "🜂", name: "Fire" },
  { key: "2", glyph: "🜃", name: "Earth" },
  { key: "3", glyph: "🜄", name: "Water" },
  { key: "4", glyph: "❖", name: "Lozenge" },
  { key: "5", glyph: "✦", name: "Star" },
  { key: "6", glyph: "☾", name: "Moon" },
  { key: "7", glyph: "⚓", name: "Anchor" },
  { key: "8", glyph: "⌛", name: "Glass" },
  { key: "9", glyph: "✹", name: "Spark" },
] as const;

export type ScratchSymbol = (typeof SCRATCH_SYMBOLS)[number];

/** The symbol reserved for the pool. Only ever appears three-in-a-row. */
export const JACKPOT_SYMBOL_INDEX = 9;

export function symbolAt(index: number): ScratchSymbol {
  return (SCRATCH_SYMBOLS[index] ?? SCRATCH_SYMBOLS[0]) as ScratchSymbol;
}

/** Parses a stored three-character reveal into symbol indices. */
export function parseReveal(reveal: string): number[] {
  return reveal
    .split("")
    .map((char) => Number.parseInt(char, 10))
    .filter((value) => Number.isInteger(value));
}

/** True when all three marks match — the only shape that pays. */
export function isWinningReveal(reveal: number[]): boolean {
  return (
    reveal.length === 3 && reveal[0] === reveal[1] && reveal[1] === reveal[2]
  );
}

/**
 * True when exactly two of the three match: the near miss.
 *
 * Named and tested rather than left implicit, because the UI treats it
 * differently and the distinction is the entire emotional content of a
 * losing card.
 */
export function isNearMiss(reveal: number[]): boolean {
  if (reveal.length !== 3 || isWinningReveal(reveal)) return false;
  return new Set(reveal).size === 2;
}
