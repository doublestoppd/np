/**
 * The Fortune Engine (ADR-66): three reels, a paytable, and nothing else.
 * PURE — no database, no randomness, no clock.
 *
 * **The reels ARE the odds.** A stop is drawn on each reel and the
 * paytable is read off what came up. That is the opposite of how the
 * Tumblehouse Drums and the salt chits work (ADR-48), where the prize is
 * drawn from a weighted table first and the faces are dressed to match —
 * and the difference is deliberate.
 *
 * Those two publish a ladder of prizes with weights, so drawing the faces
 * first would make the published weights a fiction. This machine publishes
 * a PAYTABLE: three moons pays this, three stars pay that. A paytable is a
 * claim about what the reels do, and the only way to make that claim true
 * is to actually spin the reels and read them. Dressing the reels here
 * would be the lie.
 *
 * It also buys something the other two cannot have: the whole probability
 * space is 32 x 32 x 32 = 32,768 outcomes, so the return is not estimated
 * or simulated. It is enumerated, exactly, in the test beside this file.
 */

/** What is painted on the drums, commonest first. */
export const SYMBOLS = [
  "acorn",
  "toadstool",
  "bell",
  "honey",
  "key",
  "star",
  "moon",
] as const;

export type Symbol = (typeof SYMBOLS)[number];

/** Stops per reel. Fixed at 32 so the space stays small enough to count. */
export const STOPS = 32;

/**
 * How many stops each symbol occupies on each reel.
 *
 * The third reel is deliberately meaner: one fewer star and one more
 * acorn. Real machines do this and it is not decoration — it is what makes
 * a near miss feel like a near miss. Two stars land often enough to be
 * exciting; the third reel is where they mostly fail to arrive.
 */
const STRIPS: readonly Readonly<Record<Symbol, number>>[] = [
  { acorn: 10, toadstool: 7, bell: 5, honey: 4, key: 3, star: 2, moon: 1 },
  { acorn: 10, toadstool: 7, bell: 5, honey: 4, key: 3, star: 2, moon: 1 },
  { acorn: 11, toadstool: 7, bell: 5, honey: 4, key: 3, star: 1, moon: 1 },
];

/** The symbol at a given stop on a given reel. */
export function symbolAt(reel: number, stop: number): Symbol {
  const strip = STRIPS[reel] as Record<Symbol, number>;
  let remaining = stop % STOPS;
  for (const symbol of SYMBOLS) {
    const width = strip[symbol];
    if (remaining < width) return symbol;
    remaining -= width;
  }
  // Unreachable: the strips sum to STOPS, which `assertStripsAreWhole`
  // below is a compile-time-adjacent check on and the test pins.
  return "acorn";
}

/** Every strip must fill the drum exactly, or `symbolAt` lies. */
export function stripTotals(): number[] {
  return STRIPS.map((strip) =>
    SYMBOLS.reduce((sum, symbol) => sum + strip[symbol], 0),
  );
}

/** How many stops on `reel` show `symbol`. Used by the enumeration. */
export function stopsShowing(reel: number, symbol: Symbol): number {
  return (STRIPS[reel] as Record<Symbol, number>)[symbol];
}

/**
 * What three of a kind pays, as a multiple of the stake.
 *
 * Three moons is absent on purpose: it is the jackpot, and what it pays
 * is not a multiple of anything — see `JACKPOT` below.
 */
export const THREE_OF_A_KIND: Readonly<Record<Symbol, number>> = {
  acorn: 3,
  toadstool: 10,
  bell: 20,
  honey: 50,
  key: 150,
  star: 400,
  moon: 0,
};

/** Two moons anywhere, and one moon anywhere. Consolation, not a line. */
export const TWO_MOONS = 15;
export const ONE_MOON = 1;

/**
 * Three moons below the top stake. The pool is only fed by, and only
 * payable at, the top stake — so a smaller stake gets a large fixed
 * multiple instead of a share in something it never paid into.
 */
export const MOONS_WITHOUT_THE_POOL = 1_000;

export type Outcome =
  /** Three moons at the top stake. Pays whatever the pool stands at. */
  | { kind: "JACKPOT"; symbols: Symbol[] }
  | { kind: "PAYS"; symbols: Symbol[]; multiple: number; line: string }
  | { kind: "NOTHING"; symbols: Symbol[] };

/**
 * Reads the paytable off three symbols.
 *
 * Order of precedence matters and is the ordinary one: the best line a
 * spin qualifies for is the one it is paid. Three moons beats two moons,
 * which beats one.
 */
export function evaluate(
  symbols: Symbol[],
  { topStake }: { topStake: boolean },
): Outcome {
  const moons = symbols.filter((symbol) => symbol === "moon").length;

  if (moons === 3) {
    return topStake
      ? { kind: "JACKPOT", symbols }
      : {
          kind: "PAYS",
          symbols,
          multiple: MOONS_WITHOUT_THE_POOL,
          line: "Three moons",
        };
  }

  const [first, second, third] = symbols;
  if (first === second && second === third && first !== undefined) {
    return {
      kind: "PAYS",
      symbols,
      multiple: THREE_OF_A_KIND[first],
      line: `Three ${first}s`,
    };
  }

  if (moons === 2) {
    return { kind: "PAYS", symbols, multiple: TWO_MOONS, line: "Two moons" };
  }
  if (moons === 1) {
    return { kind: "PAYS", symbols, multiple: ONE_MOON, line: "One moon" };
  }
  return { kind: "NOTHING", symbols };
}

/** What a spin pays, in coins, given the stake. Jackpot handled elsewhere. */
export function coinsFor(outcome: Outcome, stake: bigint): bigint {
  if (outcome.kind !== "PAYS") return 0n;
  return stake * BigInt(outcome.multiple);
}
