/**
 * CLI: npm run content:validate
 * Offline content validation — never opens a database connection. Prints
 * every problem with its domain and subject; exits nonzero on failure.
 */
import {
  ContentValidationError,
  countWordAnswers,
  requestBalanceReport,
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
    mealEntries: content.daily.meal.entries.length,
    locationActivities: content.regions.reduce(
      (n, r) => n + r.locations.reduce((m, l) => m + (l.activities ?? []).length, 0),
      0,
    ),
    requestBoards: content.requestBoards.length,
    requests: content.requestBoards.reduce((n, b) => n + b.requests.length, 0),
  };
  console.log("Content OK:", JSON.stringify(counts));
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
