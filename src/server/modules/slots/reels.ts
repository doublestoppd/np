import { randomInt } from "node:crypto";

/**
 * Turning a decided outcome into three drum faces. SERVER ONLY.
 *
 * The outcome is drawn FIRST, from the tier's prize table, and this only
 * dresses it. That ordering is the same one the chits use (ADR-48) and it
 * matters for the same reason: if the faces were drawn and the prize read
 * off them, the published weights would be a fiction and the real odds
 * would be whatever the face maths happened to produce.
 *
 * So the machine always tells the truth about what it paid — three
 * matching faces exactly when it paid — and the near miss is cosmetic,
 * chosen after the fact for a pull that was already a loss.
 */

/** How often a losing pull shows two of three rather than three unlike. */
export const NEAR_MISS_CHANCE = 60;

/** Picks `count` distinct face indices from a drum of `faces`. */
function distinctFaces(faces: number, count: number): number[] {
  const pool = Array.from({ length: faces }, (_, index) => index);
  const picked: number[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    picked.push(...pool.splice(randomInt(0, pool.length), 1));
  }
  return picked;
}

function shuffle(values: number[]): number[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const a = out[i] as number;
    out[i] = out[j] as number;
    out[j] = a;
  }
  return out;
}

/**
 * Three faces for a decided outcome, as three hex characters.
 *
 * - A win shows three of the winning outcome's own face. Which face it is
 *   was authored with the prize, so the drum that comes up is the drum
 *   the published ladder promised for that prize.
 * - A loss shows two-and-one (a near miss) or three unlike.
 *
 * The near miss is placed at a random position rather than always last:
 * the machine reveals drums left to right, and a pair that was always the
 * first two would make every loss legible before the third drum stopped.
 */
export function drawReels({
  won,
  faces,
  winningFace,
}: {
  won: boolean;
  faces: number;
  winningFace: number | null;
}): string {
  if (won) {
    // A winner without a face is a content bug the CHECK constraint and
    // offline validation both rule out; falling back to the first drum
    // beats throwing in the middle of a paid transaction.
    const face = winningFace ?? 0;
    const key = face.toString(16);
    return `${key}${key}${key}`;
  }
  // Two distinct faces are needed for a near miss and three for a plain
  // loss. A drum too small for either cannot produce a losing face at all,
  // which the schema's three-face minimum rules out.
  if (faces >= 3 && randomInt(0, 100) < NEAR_MISS_CHANCE) {
    const [pair, odd] = distinctFaces(faces, 2) as [number, number];
    return shuffle([pair, pair, odd])
      .map((value) => value.toString(16))
      .join("");
  }
  const three = distinctFaces(faces, 3);
  if (three.length < 3) {
    return "012";
  }
  return three.map((value) => value.toString(16)).join("");
}
