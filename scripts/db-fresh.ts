/**
 * npm run db:fresh — the one-command development reset: drops the
 * database, applies the current schema, regenerates the client, validates
 * and seeds all content, and prints a concise summary. Guarded: refuses
 * production and non-disposable targets.
 */
import { spawnSync } from "node:child_process";
import { assertDatabaseIsDisposable } from "./db-guard";

assertDatabaseIsDisposable();

function run(label: string, command: string, args: string[]): void {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if ((result.status ?? 1) !== 0) {
    console.error(`db:fresh failed during: ${label}`);
    process.exit(result.status ?? 1);
  }
}

run("Reset database (drop + apply migrations)", "npx", [
  "prisma",
  "migrate",
  "reset",
  "--force",
  "--skip-seed",
]);
run("Generate Prisma client", "npx", ["prisma", "generate"]);
run("Validate + seed content", "npx", ["prisma", "db", "seed"]);
console.log("\ndb:fresh complete — schema applied, content seeded.");
