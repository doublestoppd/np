/**
 * The faces painted on the Tumblehouse drums. PURE — shared by the server
 * (which draws them) and the client (which spins them).
 *
 * A pull is three drums. Three the same pays what that face is worth;
 * anything else pays nothing. Two the same is a near miss, and near misses
 * are deliberately common (ADR-49) — they are most of what a losing pull
 * feels like, and a losing pull that shows three unrelated faces feels
 * like nothing at all.
 *
 * A token tier uses the FIRST `faces` entries of this list, so the pale
 * token's drums are a subset of the black token's. That is what makes the
 * ladder legible: the faces a player already knows keep their meaning as
 * they move up, and the new ones are visibly new.
 */

export const SLOT_FACES = [
  { key: "0", glyph: "🜔", name: "Salt" },
  { key: "1", glyph: "🐟", name: "Fish" },
  { key: "2", glyph: "🍃", name: "Leaf" },
  { key: "3", glyph: "🔔", name: "Bell" },
  { key: "4", glyph: "🗝", name: "Key" },
  { key: "5", glyph: "🪶", name: "Feather" },
  { key: "6", glyph: "⌛", name: "Glass" },
  { key: "7", glyph: "🧭", name: "Compass" },
  { key: "8", glyph: "✦", name: "Star" },
  { key: "9", glyph: "👑", name: "Crown" },
  { key: "a", glyph: "☀", name: "Sun" },
  { key: "b", glyph: "☾", name: "Moon" },
] as const;

export type SlotFace = (typeof SLOT_FACES)[number];

/** Drums are recorded as one hex character each, so `reels` is 3 chars. */
export const MAX_FACES = SLOT_FACES.length;

export function faceAt(index: number): SlotFace {
  return (SLOT_FACES[index] ?? SLOT_FACES[0]) as SlotFace;
}

/** Parses a stored three-character result into face indices. */
export function parseReels(reels: string): number[] {
  return reels
    .split("")
    .map((char) => Number.parseInt(char, 16))
    .filter((value) => Number.isInteger(value));
}

/** True when all three drums match — the only shape that pays. */
export function isWinningReels(reels: number[]): boolean {
  return reels.length === 3 && reels[0] === reels[1] && reels[1] === reels[2];
}

/**
 * True when exactly two of the three match: the near miss.
 *
 * Named and tested rather than left implicit, because the machine treats
 * it differently — the third drum is held back a beat — and that beat is
 * the entire emotional content of a losing pull.
 */
export function isNearMissReels(reels: number[]): boolean {
  if (reels.length !== 3 || isWinningReels(reels)) return false;
  return new Set(reels).size === 2;
}
