import { createHash, randomBytes } from "node:crypto";
import {
  MATCHING_CONFIG,
  type MatchingDifficulty,
} from "@/lib/games/matching-rules";

/**
 * Board generation for the matching game. SERVER ONLY.
 *
 * The seed is the whole security model, exactly as it is for the Sorting
 * Bench. A run stores a seed and an append-only flip log; the layout is
 * derived from the seed on every submission and is never stored, never
 * logged, and never serialized into any response or idempotency payload.
 * A player holding the seed could read every pair before turning a card,
 * which is the only thing there is to cheat at here.
 *
 * The shuffle must be reproducible forever — the same seed has to yield
 * the same board on any machine at any version, or a run in progress
 * would change under its player — so it uses an explicit pinned PRNG
 * rather than anything from the platform.
 */

export const LAYOUT_VERSION = 1;

export function newLayoutSeed(): string {
  return randomBytes(16).toString("hex");
}

/** Deterministic stream keyed by the seed; SHA-256 over `seed:counter`. */
function* randomStream(seed: string): Generator<number> {
  let counter = 0;
  for (;;) {
    const digest = createHash("sha256").update(`${seed}:${counter}`).digest();
    for (let offset = 0; offset + 4 <= digest.length; offset += 4) {
      yield digest.readUInt32BE(offset);
    }
    counter += 1;
  }
}

/**
 * The board: two of each pair id, Fisher-Yates shuffled from the seed.
 * `layout[i]` is the pair id under card `i`.
 */
export function buildLayout(
  seed: string,
  difficulty: MatchingDifficulty,
): number[] {
  const { pairs } = MATCHING_CONFIG[difficulty];
  const layout: number[] = [];
  for (let pair = 0; pair < pairs; pair++) {
    layout.push(pair, pair);
  }
  const stream = randomStream(seed);
  for (let i = layout.length - 1; i > 0; i--) {
    // Rejection sampling keeps the shuffle uniform; a plain modulo biases
    // the low indices, and on a board this small that is visible.
    const bound = i + 1;
    const limit = Math.floor(0x1_0000_0000 / bound) * bound;
    let value = stream.next().value;
    while (value >= limit) {
      value = stream.next().value;
    }
    const j = value % bound;
    const a = layout[i] as number;
    layout[i] = layout[j] as number;
    layout[j] = a;
  }
  return layout;
}
