import { createHash, randomBytes } from "node:crypto";
import {
  COPIES_PER_KIND,
  SORT_KINDS,
  type SortKind,
} from "@/lib/games/sorting-rules";

/**
 * Deck generation for the Sorting Bench. SERVER ONLY.
 *
 * The seed is the whole security model. A run stores a seed and an
 * append-only list of moves; the board and the score are derived from
 * them on every submission and are never stored, so there is nothing to
 * desynchronise and nothing for a client to assert. The seed itself is
 * never serialized into any response, log line, or idempotency payload —
 * a player who had it could read the whole deck and plan a perfect run.
 *
 * The shuffle must be reproducible forever: the same seed has to yield
 * the same deck on any machine, at any version, or a run in progress
 * would change under its player. So it uses an explicit, pinned PRNG
 * rather than anything from the platform.
 */

export const DECK_VERSION = 1;

export function newDeckSeed(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Deterministic stream keyed by the seed. SHA-256 over `seed:counter`,
 * consumed four bytes at a time — pinned by construction rather than by
 * a dependency, since the guarantee this needs is "identical output in
 * five years", not speed.
 */
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
 * The deck: twelve of each kind, Fisher-Yates shuffled from the seed.
 *
 * Composition is fixed rather than random so that every player faces the
 * same problem and the deck stays countable. Counting is a modest edge
 * rather than the point of the game — see the note on COPIES_PER_KIND in
 * the rules module for what it is actually worth. What makes a run take
 * decisions is that there are fewer shelves than kinds.
 */
export function buildDeck(seed: string): SortKind[] {
  const deck: SortKind[] = [];
  for (const kind of SORT_KINDS) {
    for (let i = 0; i < COPIES_PER_KIND; i++) {
      deck.push(kind);
    }
  }
  const stream = randomStream(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    // Rejection sampling keeps the draw uniform; a plain modulo would
    // bias the low indices and, over a fixed deck, that is visible.
    const bound = i + 1;
    const limit = Math.floor(0x1_0000_0000 / bound) * bound;
    let value = stream.next().value;
    while (value >= limit) {
      value = stream.next().value;
    }
    const j = value % bound;
    const a = deck[i] as SortKind;
    deck[i] = deck[j] as SortKind;
    deck[j] = a;
  }
  return deck;
}
