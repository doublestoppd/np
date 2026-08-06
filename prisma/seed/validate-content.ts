/**
 * CLI: npm run content:validate
 * Offline content validation — never opens a database connection. Prints
 * every problem with its domain and subject; exits nonzero on failure.
 */
import { ContentValidationError, validateAllContent } from "./validation";

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
    wordAnswers: Object.values(content.daily.wordAnswers).reduce(
      (n, list) => n + list.length,
      0,
    ),
    wheelPrizes: content.daily.wheel.configuration.prizes.length,
    mealEntries: content.daily.meal.entries.length,
  };
  console.log("Content OK:", JSON.stringify(counts));
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
