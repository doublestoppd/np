/**
 * CLI: npm run content:validate
 * Offline content validation — never opens a database connection. Prints
 * every problem with its domain and subject; exits nonzero on failure.
 */
import {
  ContentValidationError,
  countWordAnswers,
  requestBalanceReport,
  scratchOddsReport,
  slotOddsReport,
  validateAllContent,
} from "./validation";

try {
  const content = validateAllContent();
  const counts = {
    species: content.species.length,
    categories: content.categories.length,
    tags: content.tags.length,
    items: content.items.length,
    regions: content.regions.length,
    locations: content.regions.reduce((n, r) => n + r.locations.length, 0),
    npcShops: content.npcShops.length,
    upgradeTiers: content.upgradeTiers.length,
    wheelPrizes: content.daily.wheel.configuration.prizes.length,
    books: content.books.length,
    spinTokens: content.spinTokens.length,
    mealEntries: content.daily.meal.entries.length,
    locationActivities: content.regions.reduce(
      (n, r) => n + r.locations.reduce((m, l) => m + (l.activities ?? []).length, 0),
      0,
    ),
    requestBoards: content.requestBoards.length,
    requests: content.requestBoards.reduce((n, b) => n + b.requests.length, 0),
    forageSpots: content.forageSpots.length,
    forageEntries: content.forageSpots.reduce((n, s) => n + s.entries.length, 0),
    hollowGrounds: content.hollow.grounds.length,
    hollowAirs: content.hollow.airs.length,
    furnishings: content.items.filter((i) => i.furnishing !== undefined).length,
  };
  console.log("Content OK:", JSON.stringify(counts));

  // What the Hollow can absorb, so a content edit that quietly guts the
  // sink shows up in the same run that made it (ADR-39).
  const groundLadder = content.hollow.groundPrices.reduce(
    (total, rung) => total + rung.price,
    0n,
  );
  const airLadder = content.hollow.airs.reduce(
    (total, air) => total + air.price,
    0n,
  );
  const oneOfEach = content.items
    .filter((item) => item.furnishing !== undefined)
    .reduce((total, item) => total + item.price, 0n);
  console.log(
    `Hollow sink: grounds ${groundLadder} + airs ${airLadder} + one of every ` +
      `furnishing ${oneOfEach} = ${groundLadder + airLadder + oneOfEach} coins ` +
      `(and every furnishing may be bought again, without limit)`,
  );
  // Word rotations report total and active separately: totals grow
  // append-only, while the active count is what the rotation actually
  // cycles through (minimum enforced by validation).
  for (const [difficulty, wordCounts] of Object.entries(
    countWordAnswers(content.daily.wordAnswers),
  )) {
    console.log(
      `Word answers ${difficulty}: ${wordCounts.total} configured, ${wordCounts.active} active`,
    );
  }

  // Economy balance for every request: what it consumes, what it pays, and
  // whether the requirements are purchasable (the arbitrage route).
  const balance = requestBalanceReport(content);
  if (balance.length > 0) {
    console.log("\nRequest balance (reference value -> reward, margin):");
    for (const row of balance) {
      const npc = row.npcCost === null ? "not NPC-buyable" : `npc ${row.npcCost}`;
      console.log(
        `  ${row.board}/${row.request}: ${row.requirements} | ` +
          `ref ${row.referenceValue} | ${npc} | reward ${row.reward} | ` +
          `margin ${row.grossMargin >= 0n ? "+" : ""}${row.grossMargin}` +
          (row.arbitrage ? "  ** ARBITRAGE **" : ""),
      );
    }
  }

  // What each scratch card actually pays back. A weight is easy to change
  // and hard to feel, so the consequence is printed in the same run as the
  // change (ADR-46). Anything at or above 100% fails validation outright.
  const odds = scratchOddsReport(content);
  if (odds.length > 0) {
    // Two returns per card. "expected" values item prizes at reference
    // price and includes the pool slice — it is what the house-edge guard
    // checks. "coins" counts coins alone, which is the number to retune
    // against: there is no NPC buyback, so an item prize becomes coins
    // only through a player-to-player sale, and that is zero-sum.
    console.log(
      "\nScratch cards (price -> expected return, pool slice included):",
    );
    for (const row of odds) {
      console.log(
        `  ${row.card}: price ${row.price} | expected ${row.expected} ` +
          `(${row.returnPercent}%) | coins ${row.coinsExpected} ` +
          `(${row.coinsReturnPercent}%) | ${row.outcomes} outcomes | ` +
          `rarest ${row.rarestPercent}%`,
      );
    }
  }
  // What each token tier actually pays back, and how often it pays at
  // all. Both numbers, because they move independently: a tier can hold
  // its return steady while quietly becoming much meaner (ADR-49).
  const drums = slotOddsReport(content);
  if (drums.length > 0) {
    console.log("\nToken drums (price -> expected return):");
    for (const row of drums) {
      console.log(
        `  ${row.token}: price ${row.price} | expected ${row.expected} ` +
          `(${row.returnPercent}%) | coins ${row.coinsExpected} ` +
          `(${row.coinsReturnPercent}%) | ${row.faces} faces | ` +
          `${row.losingPercent}% lose | rarest ${row.rarestPercent}%`,
      );
    }
  }
} catch (error) {
  if (error instanceof ContentValidationError) {
    console.error(`Content validation failed — ${error.problems.length} problem(s):\n`);
    for (const problem of error.problems) {
      console.error(`  [${problem.domain}] ${problem.subject}: ${problem.message}`);
    }
    process.exit(1);
  }
  throw error;
}
