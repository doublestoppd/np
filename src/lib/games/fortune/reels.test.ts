import { describe, expect, it } from "vitest";
import {
  coinsFor,
  evaluateLine,
  evaluateWindow,
  JACKPOT_LINE,
  lineStake,
  MOONS_WITHOUT_THE_POOL,
  PAYLINES,
  REELS,
  ROWS,
  STOPS,
  stopsShowing,
  stripTotals,
  summarize,
  SYMBOLS,
  symbolAt,
  THREE_OF_A_KIND,
  TWO_MOONS,
  windowAt,
  type ReelWindow,
  type Symbol,
} from "./reels";

/**
 * The Fortune Engine's reels (ADR-66, amended by ADR-68).
 *
 * The whole point of building this machine on real reel strips rather than
 * a weighted prize table is that its odds are not a claim — they are a
 * consequence, and the consequence is countable. Nine symbols are showing,
 * but three stop positions decide all nine, so the space is still
 * 32 x 32 x 32 = 32,768 outcomes, which fits in a loop.
 *
 * So none of this is a simulation and none of it is a sample. Every number
 * below is the exact expected return of the machine as configured, and if
 * somebody moves a single stop on a single reel it moves too.
 */

/** Every possible position of the three drums, once. */
function everyWindow(): ReelWindow[] {
  const all: ReelWindow[] = [];
  for (let a = 0; a < STOPS; a += 1) {
    for (let b = 0; b < STOPS; b += 1) {
      for (let c = 0; c < STOPS; c += 1) {
        all.push(windowAt([a, b, c]));
      }
    }
  }
  return all;
}

const ALL = everyWindow();
const SPACE = STOPS ** 3;

/** Total paid over the whole space, in LINE stakes. */
function paidOver(topStake: boolean): number {
  return ALL.reduce(
    (sum, window) => sum + evaluateWindow(window, { topStake }).multiple,
    0,
  );
}

/** The same figure as a share of what was staked. Five lines to a stake. */
function returnOver(topStake: boolean): number {
  return paidOver(topStake) / PAYLINES.length / SPACE;
}

describe("the reel strips", () => {
  it("fill every drum exactly", () => {
    // If a strip does not sum to STOPS, `symbolAt` silently falls off the
    // end of its loop and every stop past the gap reads as an acorn — the
    // machine would still run, and its published odds would be fiction.
    for (const total of stripTotals()) {
      expect(total).toBe(STOPS);
    }
  });

  it("give every symbol a place on every reel", () => {
    // A symbol missing from one reel can never pay three of a kind, which
    // would make its line in the paytable a lie of omission.
    for (const symbol of SYMBOLS) {
      for (let reel = 0; reel < REELS; reel += 1) {
        expect(
          stopsShowing(reel, symbol),
          `${symbol} on reel ${reel}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("wrap the drum in both directions", () => {
    // The window shows the stop and its NEIGHBOURS, so stop 0 has to read
    // a row above it. A modulo that returns a negative index would land on
    // `undefined` and the top-left cell would be blank once in 32 pulls.
    expect(symbolAt(0, -1)).toBe(symbolAt(0, STOPS - 1));
    expect(symbolAt(0, STOPS)).toBe(symbolAt(0, 0));
  });
});

describe("the window", () => {
  it("shows three symbols on each of three reels", () => {
    const window = windowAt([0, 5, 17]);
    expect(window).toHaveLength(REELS);
    for (const reel of window) expect(reel).toHaveLength(ROWS);
  });

  it("puts the stop itself on the centre row", () => {
    // Row 1 is the stop; rows 0 and 2 are what sits above and below it on
    // the drum. If this drifted, the centre line — the only one that can
    // take the pool — would be reading a neighbour.
    for (let stop = 0; stop < STOPS; stop += 1) {
      const window = windowAt([stop, stop, stop]);
      expect((window[0] as Symbol[])[1]).toBe(symbolAt(0, stop));
      expect((window[0] as Symbol[])[0]).toBe(symbolAt(0, stop - 1));
      expect((window[0] as Symbol[])[2]).toBe(symbolAt(0, stop + 1));
    }
  });
});

describe("the paylines", () => {
  it("are five distinct lines across the window", () => {
    expect(PAYLINES).toHaveLength(5);
    const drawn = new Set(PAYLINES.map((line) => line.rows.join("")));
    expect(drawn.size).toBe(5);
    for (const line of PAYLINES) {
      expect(line.rows).toHaveLength(REELS);
      for (const row of line.rows) {
        expect(row).toBeGreaterThanOrEqual(0);
        expect(row).toBeLessThan(ROWS);
      }
    }
  });

  it("number the centre line first, and it is the jackpot line", () => {
    expect(PAYLINES[0]?.rows).toEqual([1, 1, 1]);
    expect(JACKPOT_LINE).toBe(PAYLINES[0]?.number);
  });

  /**
   * The invariant the whole redesign rests on.
   *
   * Every line is a uniform, independent draw from the same three strips —
   * the diagonals no less than the straight rows — so each pays exactly as
   * often as the others, and exactly as often as the single line did
   * before the window was widened. That is why splitting the stake five
   * ways left the return alone instead of multiplying it by five.
   */
  it("each pay exactly as often as every other line", () => {
    const perLine = new Map<number, number>();
    for (const window of ALL) {
      for (const win of evaluateWindow(window, { topStake: false }).wins) {
        perLine.set(win.line, (perLine.get(win.line) ?? 0) + 1);
      }
    }
    for (const line of PAYLINES) {
      // 4,640 — the exact hit count of the old one-line machine.
      expect(perLine.get(line.number), `line ${line.number}`).toBe(4_640);
    }
  });
});

describe("the paytable", () => {
  it("pays three of a kind, best line first", () => {
    expect(
      evaluateLine(["star", "star", "star"], { line: 1, topStake: false }),
    ).toMatchObject({ multiple: THREE_OF_A_KIND.star });
    // Three moons is not "three of a kind" — it outranks it.
    expect(
      evaluateLine(["moon", "moon", "moon"], { line: 1, topStake: true }),
    ).toMatchObject({ jackpot: true });
    // Two moons beats the nothing it would otherwise be.
    expect(
      evaluateLine(["moon", "moon", "acorn"], { line: 1, topStake: true }),
    ).toMatchObject({ multiple: TWO_MOONS });
    expect(
      evaluateLine(["moon", "bell", "acorn"], { line: 1, topStake: true }),
    ).toMatchObject({ multiple: 1 });
    expect(
      evaluateLine(["bell", "key", "acorn"], { line: 1, topStake: true }),
    ).toBeNull();
  });

  it("names three of a kind in English", () => {
    // "Three honeys" was what the obvious `${symbol}s` produced, and this
    // string is shown to the player and written into their history.
    expect(
      evaluateLine(["honey", "honey", "honey"], { line: 2, topStake: false })
        ?.label,
    ).toBe("Three honeypots");
  });

  it("only offers the pool on the centre line, at the top stake", () => {
    const moons: Symbol[] = ["moon", "moon", "moon"];
    // The centre line at the top stake: the pool.
    expect(
      evaluateLine(moons, { line: JACKPOT_LINE, topStake: true }),
    ).toMatchObject({ jackpot: true, multiple: 0 });
    // An outer line, same stake: a large fixed multiple instead. Without
    // this the jackpot would land five times as often and the pool would
    // never grow to anything worth watching.
    expect(evaluateLine(moons, { line: 4, topStake: true })).toMatchObject({
      jackpot: false,
      multiple: MOONS_WITHOUT_THE_POOL,
    });
    // Below the top stake, nothing takes the pool: a stake that does not
    // feed it does not take a share of it.
    expect(
      evaluateLine(moons, { line: JACKPOT_LINE, topStake: false }),
    ).toMatchObject({ jackpot: false, multiple: MOONS_WITHOUT_THE_POOL });
  });

  it("splits the stake across the five lines", () => {
    // A line stake is a fifth of the pull, so a 150x line on a 500 stake
    // pays 150 x 100, not 150 x 500. Getting this wrong is a 5x error in
    // the machine's favour or the player's.
    expect(lineStake(500n)).toBe(100n);
    const window = windowAt([0, 0, 0]);
    const outcome = { ...evaluateWindow(window, { topStake: false }) };
    expect(coinsFor({ ...outcome, multiple: 150 }, 500n)).toBe(15_000n);
    // The jackpot is not a multiple of anything, so it pays nothing here —
    // the pool is settled by the domain, which owns the money.
    expect(coinsFor({ ...outcome, multiple: 0, jackpot: true }, 500n)).toBe(0n);
  });

  it("summarizes one win and several", () => {
    const bells = (line: number) => ({
      line,
      label: "Three bells",
      multiple: 20,
      jackpot: false,
      symbols: ["bell", "bell", "bell"] as Symbol[],
    });
    const outcome = (wins: ReturnType<typeof bells>[]) => ({
      window: [] as ReelWindow,
      wins,
      multiple: wins.length * 20,
      jackpot: false,
    });

    expect(summarize(outcome([bells(2)]))).toBe("Three bells on line 2");
    expect(summarize(outcome([bells(2), bells(3)]))).toBe(
      "Three bells on line 2, and 1 more",
    );
    expect(summarize(outcome([]))).toBe("");
    // The jackpot is its own headline whatever else landed with it.
    expect(
      summarize({ ...outcome([bells(2)]), jackpot: true }),
    ).toBe("Jackpot");
  });
});

describe("the exact return, counted over every outcome", () => {
  it("enumerates to exactly the size of the space", () => {
    expect(ALL).toHaveLength(SPACE);
    expect(SPACE).toBe(32_768);
  });

  it("hits the jackpot exactly once in the space", () => {
    // Three moons on the CENTRE line: one stop on each reel, so still
    // 1 in 32,768 even though the machine now shows nine symbols. This is
    // the number the whole economy of the pool rests on, and keeping it
    // where it was is why the outer lines cannot take the pool.
    const jackpots = ALL.filter(
      (window) => evaluateWindow(window, { topStake: true }).jackpot,
    );
    expect(jackpots).toHaveLength(1);
  });

  it("returns 70.7% at the top stake, before the pool", () => {
    // Aggressive by design and stated plainly: about seven coins back for
    // every ten staked, before anything the pool adds. Everything the
    // machine keeps is a coin sink, which is what it is for.
    expect(paidOver(true)).toBe(115_790);
    expect(returnOver(true)).toBeCloseTo(0.7067, 4);
  });

  it("returns 71.3% below the top stake, exactly as the one-line machine did", () => {
    // The pin on the redesign. Below the top stake nothing behaves
    // differently line to line, so this number should be untouched by
    // widening the window — and it is, to the digit.
    expect(paidOver(false)).toBe(115_790 + MOONS_WITHOUT_THE_POOL);
    expect(returnOver(false)).toBeCloseTo(0.7128, 4);
  });

  it("never returns more than it takes, at either stake", () => {
    // The guardrail that matters. A machine with a return above 1 is a
    // coin faucet with a handle, and it would be found by players long
    // before it was found by anybody reading the table.
    expect(returnOver(true)).toBeLessThan(1);
    expect(returnOver(false)).toBeLessThan(1);
  });

  it("makes the pool worth chasing from its floor", () => {
    // What the top stake gives up against a smaller one, expressed as the
    // pool size at which they break even. Below the top stake three moons
    // pays a fixed multiple on the centre line too, and that is the only
    // difference — so the pool has to be worth at least that much.
    //
    // 200 stakes: at a 500 top stake, 100,000 coins. The pool's floor is
    // above it (JACKPOT_MINIMUM, pinned in the domain's test), so the top
    // stake is the better bet even on a pool nobody has fed yet. On the
    // one-line machine it needed 500,000 to get there.
    const gap = (paidOver(false) - paidOver(true)) / PAYLINES.length;
    expect(gap).toBe(200);
  });

  it("puts most of the return in the small, frequent lines", () => {
    // A machine whose return is all in the jackpot pays nothing for hours
    // and feels broken. Counted: acorns, toadstools and single moons — the
    // lines a player sees constantly — carry most of what comes back.
    let small = 0;
    let total = 0;
    for (const window of ALL) {
      for (const win of evaluateWindow(window, { topStake: true }).wins) {
        total += win.multiple;
        if (win.multiple <= 10) small += win.multiple;
      }
    }
    expect(small / total).toBeGreaterThan(0.4);
  });

  it("pays something on about one pull in three", () => {
    // Hit rate, counted rather than guessed at. Five lines instead of one
    // is what this change was FOR: the old machine paid on 14% of pulls
    // and sat dead for long stretches. Now a player sees something land
    // roughly every third pull — and each landing is a fifth the size,
    // which is why the return did not move.
    const hits = ALL.filter(
      (window) => evaluateWindow(window, { topStake: true }).wins.length > 0,
    ).length;
    expect(hits).toBe(10_636);
    expect(hits / SPACE).toBeCloseTo(0.3246, 4);

    // And most of them are small — a hit is usually a coin or two back,
    // not an event. Counted in line stakes: a fifth of the pull.
    const modest = ALL.filter((window) => {
      const outcome = evaluateWindow(window, { topStake: true });
      return outcome.wins.length > 0 && outcome.multiple <= 3;
    }).length;
    expect(modest / hits).toBeGreaterThan(0.6);
  });
});
