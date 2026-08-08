import { randomInt } from "node:crypto";
import {
  JACKPOT_SYMBOL_INDEX,
  SCRATCH_SYMBOLS,
} from "@/lib/games/scratch-symbols";

/**
 * Turning a decided outcome into three marks. SERVER ONLY.
 *
 * The outcome is drawn FIRST, from the prize table, and this only dresses
 * it. That ordering matters: if the marks were drawn and the prize read
 * off them, the published prize weights would be a fiction and the real
 * odds would be whatever the symbol maths happened to produce.
 *
 * So the card always tells the truth about what it paid — three matching
 * marks exactly when it won — and the near miss is cosmetic, chosen after
 * the fact for a card that was already a loss.
 */

/** How often a losing card shows two of three rather than three unlike. */
const NEAR_MISS_CHANCE = 55;

const ORDINARY = SCRATCH_SYMBOLS.length - 1;

function orderedRandomDistinct(count: number): number[] {
  const pool = Array.from({ length: ORDINARY }, (_, index) => index);
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
 * Three marks for a decided outcome.
 *
 * - A win shows three of one mark. The jackpot gets its own mark, which
 *   never appears otherwise, so seeing two of them is a genuine near miss
 *   on the pool rather than a coincidence.
 * - A loss shows two-and-one (a near miss) or three unlike.
 */
export function drawReveal({
  won,
  jackpot,
}: {
  won: boolean;
  jackpot: boolean;
}): string {
  if (won) {
    const symbol = jackpot ? JACKPOT_SYMBOL_INDEX : randomInt(0, ORDINARY);
    return `${symbol}${symbol}${symbol}`;
  }
  if (randomInt(0, 100) < NEAR_MISS_CHANCE) {
    const [pair, odd] = orderedRandomDistinct(2) as [number, number];
    return shuffle([pair, pair, odd]).join("");
  }
  const three = orderedRandomDistinct(3);
  // A pool short of three distinct marks would silently produce a win; it
  // cannot happen with the shipped set, and falling back beats lying.
  if (three.length < 3) {
    return `${0}${1}${2}`;
  }
  return three.join("");
}
