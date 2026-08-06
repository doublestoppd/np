/**
 * CLI: npm run content:validate
 * Offline content validation — never opens a database connection. Prints
 * every problem with its domain and subject; exits nonzero on failure.
 */
import {
  ContentValidationError,
  countWordAnswers,
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
