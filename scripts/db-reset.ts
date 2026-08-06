/**
 * npm run db:reset — drops and recreates the development database schema
 * from the committed migrations (no seed). Guarded: refuses production
 * and non-disposable targets.
 */
import { spawnSync } from "node:child_process";
import { assertDatabaseIsDisposable } from "./db-guard";

assertDatabaseIsDisposable();

const result = spawnSync(
  "npx",
  ["prisma", "migrate", "reset", "--force", "--skip-seed"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
