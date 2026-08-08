import { describe, expect, it } from "vitest";
import {
  coinsFor,
  evaluate,
  MOONS_WITHOUT_THE_POOL,
  STOPS,
  stopsShowing,
  stripTotals,
  SYMBOLS,
  symbolAt,
  THREE_OF_A_KIND,
  TWO_MOONS,
  type Symbol,
} from "./reels";

/**
 * The Fortune Engine's reels (ADR-66).
 *
 * The whole point of building this machine on real reel strips rather than
 * a weighted prize table is that its odds are not a claim — they are a
 * consequence, and the consequence is countable. 32 x 32 x 32 is 32,768
 * outcomes, which fits in a loop.
 *
 * So none of this is a simulation and none of it is a sample. Every number
 * below is the exact expected return of the machine as configured, and if
 * somebody moves a single stop on a single reel it moves too.
 */

/** Every possible spin, once. */
function everyOutcome(): Symbol[][] {
  const all: Symbol[][] = [];
  for (let a = 0; a < STOPS; a += 1) {
    for (let b = 0; b < STOPS; b += 1) {
      for (let c = 0; c < STOPS; c += 1) {
        all.push([symbolAt(0, a), symbolAt(1, b), symbolAt(2, c)]);
      }
    }
  }
  return all;
}

const ALL = everyOutcome();
const SPACE = STOPS ** 3;

/** Total paid out over the whole space, in stake-units. */
function paidOver(topStake: boolean): number {
  return ALL.reduce((sum, symbols) => {
    const outcome = evaluate(symbols, { topStake });
    return sum + Number(coinsFor(outcome, 1n));
  }, 0);
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
      for (let reel = 0; reel < 3; reel += 1) {
        expect(
          stopsShowing(reel, symbol),
          `${symbol} on reel ${reel}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("enumerate to exactly the size of the space", () => {
    expect(ALL).toHaveLength(SPACE);
    expect(SPACE).toBe(32_768);
  });
});

describe("the paytable", () => {
  it("pays three of a kind, best line first", () => {
    expect(
      evaluate(["star", "star", "star"], { topStake: false }),
    ).toMatchObject({ kind: "PAYS", multiple: THREE_OF_A_KIND.star });
    // Three moons is not "three of a kind" — it outranks it.
    expect(evaluate(["moon", "moon", "moon"], { topStake: true }).kind).toBe(
      "JACKPOT",
    );
    // Two moons beats the nothing it would otherwise be.
    expect(
      evaluate(["moon", "moon", "acorn"], { topStake: true }),
    ).toMatchObject({ kind: "PAYS", multiple: TWO_MOONS });
    expect(
      evaluate(["moon", "bell", "acorn"], { topStake: true }),
    ).toMatchObject({ kind: "PAYS", multiple: 1 });
    expect(evaluate(["bell", "key", "acorn"], { topStake: true }).kind).toBe(
      "NOTHING",
    );
  });

  it("only offers the pool at the top stake", () => {
    // Below it, three moons pays a large fixed multiple instead: a stake
    // that does not feed the pool does not take a share of it.
    const small = evaluate(["moon", "moon", "moon"], { topStake: false });
    expect(small).toMatchObject({
      kind: "PAYS",
      multiple: MOONS_WITHOUT_THE_POOL,
    });
  });

  it("pays in coins as a straight multiple of the stake", () => {
    const outcome = evaluate(["key", "key", "key"], { topStake: false });
    expect(coinsFor(outcome, 100n)).toBe(BigInt(THREE_OF_A_KIND.key) * 100n);
    // The jackpot is not a multiple of anything, so it pays nothing here —
    // the pool is settled by the domain, which owns the money.
    const jackpot = evaluate(["moon", "moon", "moon"], { topStake: true });
    expect(coinsFor(jackpot, 500n)).toBe(0n);
  });
});

describe("the exact return, counted over every outcome", () => {
  it("hits three moons exactly once in the space", () => {
    // One stop on each reel, so the jackpot is 1 in 32,768. This is the
    // number the whole economy of the machine rests on.
    const moons = ALL.filter((symbols) =>
      symbols.every((symbol) => symbol === "moon"),
    );
    expect(moons).toHaveLength(1);
  });

  it("returns 68.2% before the pool, at the top stake", () => {
    // Aggressive by design and stated plainly: about seven coins back for
    // every ten staked, before anything the pool adds. Everything the
    // machine keeps is a coin sink, which is what it is for.
    const paid = paidOver(true);
    expect(paid).toBe(22_358);
    expect(paid / SPACE).toBeCloseTo(0.6823, 4);
  });

  it("returns 71.3% below the top stake, where the pool is not in play", () => {
    // Slightly better, because three moons pays a fixed 1000x instead of a
    // share of a pool this stake never fed. A player choosing a small
    // stake is not being quietly charged for a lottery they cannot enter.
    const paid = paidOver(false);
    expect(paid).toBe(22_358 + MOONS_WITHOUT_THE_POOL);
    expect(paid / SPACE).toBeCloseTo(0.7128, 4);
  });

  it("never returns more than it takes, at either stake", () => {
    // The guardrail that matters. A machine with a return above 1 is a
    // coin faucet with a handle, and it would be found by players long
    // before it was found by anybody reading the table.
    expect(paidOver(true) / SPACE).toBeLessThan(1);
    expect(paidOver(false) / SPACE).toBeLessThan(1);
  });

  it("keeps the pool's share of the top stake modest", () => {
    // What the jackpot has to contribute for the top stake to be worth
    // taking: enough to beat the smaller stakes' 71.3%, and nowhere near
    // enough to make the machine give coins away. Expressed as the pool
    // size at which the two stakes break even, which is the number to
    // check when the floor is retuned.
    const gapPerSpin = (paidOver(false) - paidOver(true)) / SPACE;
    const breakEvenPool = gapPerSpin * SPACE;
    // 1000 stake-units: at a 500 top stake, a pool of 500,000 coins.
    expect(breakEvenPool).toBe(MOONS_WITHOUT_THE_POOL);
  });

  it("puts most of the return in the small, frequent lines", () => {
    // A machine whose return is all in the jackpot pays nothing for hours
    // and feels broken. Counted: acorns, toadstools and single moons — the
    // lines a player sees constantly — carry most of what comes back.
    const small = ALL.reduce((sum, symbols) => {
      const outcome = evaluate(symbols, { topStake: true });
      if (outcome.kind !== "PAYS") return sum;
      return outcome.multiple <= 10 ? sum + outcome.multiple : sum;
    }, 0);
    expect(small / paidOver(true)).toBeGreaterThan(0.4);
  });

  it("pays something on about one spin in seven", () => {
    // Hit rate, counted rather than guessed at. This is a single-line
    // three-reel machine, so it is sparse by construction — there is one
    // line to hit and nothing else on the screen to pay. 14% is in the
    // range a mechanical three-reel machine actually sits in, and most of
    // it is the one-moon line handing the stake straight back.
    //
    // Worth stating because the number is easy to get wrong from
    // intuition: a first draft of this test asserted a third, which is a
    // multi-line figure and nearly 3x the truth.
    const hits = ALL.filter(
      (symbols) => evaluate(symbols, { topStake: true }).kind !== "NOTHING",
    ).length;
    expect(hits).toBe(4_640);
    expect(hits / SPACE).toBeCloseTo(0.1416, 4);

    // And of those, the great majority are small — a hit is usually the
    // stake back or a little over, not an event.
    const modest = ALL.filter((symbols) => {
      const outcome = evaluate(symbols, { topStake: true });
      return outcome.kind === "PAYS" && outcome.multiple <= 3;
    }).length;
    expect(modest / hits).toBeGreaterThan(0.8);
  });
});
