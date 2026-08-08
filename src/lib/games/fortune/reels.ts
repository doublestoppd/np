/**
 * The Fortune Engine (ADR-66, amended by ADR-68): three reels, a 3x3
 * window, five paylines, and a paytable. PURE — no database, no
 * randomness, no clock.
 *
 * **The reels ARE the odds.** A stop is drawn on each reel and the paytable
 * is read off what came up. That is the opposite of how the Tumblehouse
 * Drums and the salt chits work (ADR-48), where the prize is drawn from a
 * weighted table first and the faces are dressed to match — and the
 * difference is deliberate.
 *
 * Those two publish a ladder of prizes with weights, so drawing the faces
 * first would make the published weights a fiction. This machine publishes
 * a PAYTABLE: three moons pays this, three stars pay that. A paytable is a
 * claim about what the reels do, and the only way to make that claim true
 * is to actually spin the reels and read them. Dressing the reels here
 * would be the lie.
 *
 * It also buys something the other two cannot have: **three stop positions
 * determine the entire screen**, so the whole probability space is still
 * 32 x 32 x 32 = 32,768 outcomes even though nine symbols are showing. The
 * return is not estimated or simulated. It is enumerated, exactly, in the
 * test beside this file.
 *
 * Each reel shows three symbols — the stop and its two neighbours — and
 * five lines are read across them. Every line is a uniform, independent
 * draw from the same three strips, which is why widening the window from
 * one line to five did not move the return at all: the stake is split
 * across the lines, so five lines at a fifth of the stake pay exactly what
 * one line at the whole stake did. What changed is the texture. A player
 * now sees something land roughly every other pull instead of one in
 * seven, and each landing is smaller.
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

/**
 * What to call three of them. "Three honeys" is not English, and the label
 * is shown to the player and written into their history.
 */
const PLURALS: Readonly<Record<Symbol, string>> = {
  acorn: "acorns",
  toadstool: "toadstools",
  bell: "bells",
  honey: "honeypots",
  key: "keys",
  star: "stars",
  moon: "moons",
};

/** Stops per reel. Fixed at 32 so the space stays small enough to count. */
export const STOPS = 32;

/** Reels across, and symbols showing on each. */
export const REELS = 3;
export const ROWS = 3;

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

/** The symbol at a given stop on a given reel. Wraps, both ways. */
export function symbolAt(reel: number, stop: number): Symbol {
  const strip = STRIPS[reel] as Record<Symbol, number>;
  // `+ STOPS` before the modulo so the row above stop 0 reads off the
  // bottom of the drum rather than off the end of the strip.
  let remaining = ((stop % STOPS) + STOPS) % STOPS;
  for (const symbol of SYMBOLS) {
    const width = strip[symbol];
    if (remaining < width) return symbol;
    remaining -= width;
  }
  // Unreachable: the strips sum to STOPS, which the test pins.
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
 * What is showing, as `[reel][row]`. Row 1 is the stop itself; rows 0 and
 * 2 are the symbols above and below it on the drum.
 */
export type ReelWindow = Symbol[][];

export function windowAt(stops: readonly number[]): ReelWindow {
  return Array.from({ length: REELS }, (_, reel) =>
    Array.from({ length: ROWS }, (_, row) =>
      symbolAt(reel, (stops[reel] ?? 0) + row - 1),
    ),
  );
}

export interface Payline {
  /** 1 to 5, as printed down the sides of the machine. */
  number: number;
  /** Which row this line takes from each reel, left to right. */
  rows: readonly [number, number, number];
  name: string;
}

/**
 * The five lines, in the order machines have always numbered them: the
 * centre first, then the straight lines, then the diagonals.
 *
 * The centre line is first because it is the one that matters — see
 * `JACKPOT_LINE`.
 */
export const PAYLINES: readonly Payline[] = [
  { number: 1, rows: [1, 1, 1], name: "the centre line" },
  { number: 2, rows: [0, 0, 0], name: "the top line" },
  { number: 3, rows: [2, 2, 2], name: "the bottom line" },
  { number: 4, rows: [0, 1, 2], name: "the falling line" },
  { number: 5, rows: [2, 1, 0], name: "the rising line" },
];

/**
 * Only the centre line can take the pool.
 *
 * Without this the jackpot would land five times as often, and a pool
 * emptied five times as often is a fifth the size — which is the opposite
 * of what a jackpot is for. Restricting it to one line keeps three moons a
 * 1-in-32,768 event on a machine that now shows nine symbols at a time.
 * Classic machines do exactly this, and it gives the centre line a reason
 * to be the line everybody watches.
 */
export const JACKPOT_LINE = 1;

/**
 * What three of a kind pays, as a multiple of the LINE stake — a fifth of
 * what the player put in, since the stake covers all five lines.
 *
 * Three moons is absent on purpose: on the centre line it is the jackpot,
 * and what that pays is not a multiple of anything.
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

/** Two moons on a line, and one moon on a line. Consolation, not a line. */
export const TWO_MOONS = 15;
export const ONE_MOON = 1;

/**
 * Three moons anywhere the pool is not in play: on an outer line, or at a
 * stake that never fed the pool. A large fixed multiple instead of a share
 * of something this pull did not pay into.
 */
export const MOONS_WITHOUT_THE_POOL = 1_000;

export interface LineWin {
  /** Which payline paid, 1 to 5. */
  line: number;
  /** "Three bells", "Two moons" — what the player is being paid for. */
  label: string;
  /** Multiple of the line stake. Zero for the jackpot, which is not one. */
  multiple: number;
  /** True only for three moons on the centre line at the top stake. */
  jackpot: boolean;
  /** The three symbols on this line, left to right. */
  symbols: Symbol[];
}

export interface SpinOutcome {
  window: ReelWindow;
  /** Every line that paid, best first. Empty on a losing pull. */
  wins: LineWin[];
  /** The sum of every line's multiple, in line stakes. */
  multiple: number;
  jackpot: boolean;
}

/**
 * Reads the paytable off one line's three symbols.
 *
 * Order of precedence matters and is the ordinary one: the best thing a
 * line qualifies for is what it is paid. Three moons beats two moons,
 * which beats one.
 */
export function evaluateLine(
  symbols: Symbol[],
  { line, topStake }: { line: number; topStake: boolean },
): LineWin | null {
  const moons = symbols.filter((symbol) => symbol === "moon").length;

  if (moons === 3) {
    if (topStake && line === JACKPOT_LINE) {
      return { line, label: "Three moons", multiple: 0, jackpot: true, symbols };
    }
    return {
      line,
      label: "Three moons",
      multiple: MOONS_WITHOUT_THE_POOL,
      jackpot: false,
      symbols,
    };
  }

  const [first, second, third] = symbols;
  if (first !== undefined && first === second && second === third) {
    return {
      line,
      label: `Three ${PLURALS[first]}`,
      multiple: THREE_OF_A_KIND[first],
      jackpot: false,
      symbols,
    };
  }

  if (moons === 2) {
    return {
      line,
      label: "Two moons",
      multiple: TWO_MOONS,
      jackpot: false,
      symbols,
    };
  }
  if (moons === 1) {
    return {
      line,
      label: "One moon",
      multiple: ONE_MOON,
      jackpot: false,
      symbols,
    };
  }
  return null;
}

/** Reads all five lines off a window. */
export function evaluateWindow(
  window: ReelWindow,
  { topStake }: { topStake: boolean },
): SpinOutcome {
  const wins = PAYLINES.flatMap((payline) => {
    const symbols = payline.rows.map(
      (row, reel) => (window[reel] as Symbol[])[row] as Symbol,
    );
    const win = evaluateLine(symbols, { line: payline.number, topStake });
    return win ? [win] : [];
  });

  // Biggest first, so the notice leads with what the player cares about.
  // The jackpot sorts to the front despite its zero multiple: it is not a
  // multiple of anything and it beats everything on the screen.
  wins.sort((a, b) =>
    a.jackpot === b.jackpot ? b.multiple - a.multiple : a.jackpot ? -1 : 1,
  );

  return {
    window,
    wins,
    multiple: wins.reduce((sum, win) => sum + win.multiple, 0),
    jackpot: wins.some((win) => win.jackpot),
  };
}

/**
 * What one line is staked: the pull divided across the five of them.
 *
 * Every stake on the ladder divides exactly by five, which the domain's
 * test pins — a stake that did not would be quietly rounded down here, and
 * the player would be paying for five lines and getting four and a bit.
 */
export function lineStake(stake: bigint): bigint {
  return stake / BigInt(PAYLINES.length);
}

/** What a spin pays, in coins, given the whole stake. */
export function coinsFor(outcome: SpinOutcome, stake: bigint): bigint {
  return BigInt(outcome.multiple) * lineStake(stake);
}

/** One line: "Three bells on line 2". Several: "3 lines". */
export function summarize(outcome: SpinOutcome): string {
  if (outcome.jackpot) return "Jackpot";
  const [best, ...rest] = outcome.wins;
  if (!best) return "";
  if (rest.length === 0) return `${best.label} on line ${best.line}`;
  return `${best.label} on line ${best.line}, and ${rest.length} more`;
}
