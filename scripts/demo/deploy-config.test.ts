/**
 * The deploy scripts must provide every variable production refuses to
 * start without.
 *
 * This exists because they did not. `DAILY_ROTATION_SECRET` became
 * required when the word puzzle and lantern were banded (ADR-44, ADR-45),
 * and neither `setup-droplet.sh` nor `redeploy.sh` was updated — so the
 * droplet built, migrated, seeded, and then crash-looped on startup with
 * "Invalid production configuration", four milestones later.
 *
 * The failure mode is nasty in a specific way: everything up to the last
 * step succeeds, so the logs are full of green before the one red line,
 * and the red line is long enough to be truncated on a phone.
 *
 * Reading the required names out of the validator's own source rather
 * than restating them is the point — a list maintained here would be a
 * third place to forget.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONFIG = join(process.cwd(), "src/server/security/configuration.ts");
const SCRIPTS = [
  join(process.cwd(), "scripts/demo/setup-droplet.sh"),
  join(process.cwd(), "scripts/demo/redeploy.sh"),
];

/** Names passed to `require(...)` inside the production-only branch. */
function requiredInProduction(source: string): string[] {
  const productionBlock = source.slice(source.indexOf("if (isProduction)"));
  return [...productionBlock.matchAll(/require\("([A-Z_]+)"/g)].map(
    (match) => match[1] as string,
  );
}

/** Names required in every environment, production included. */
function requiredAlways(source: string): string[] {
  const head = source.slice(
    source.indexOf("const require ="),
    source.indexOf("if (isProduction)"),
  );
  return [...head.matchAll(/require\("([A-Z_]+)"/g)].map(
    (match) => match[1] as string,
  );
}

/** The heredoc each script writes to the app's `.env`. */
function envBlock(source: string, path: string): string {
  const match = source.match(/cat > "\$APP_DIR\/\.env" <<ENV\n([\s\S]*?)\nENV\n/);
  if (!match) {
    throw new Error(`no .env heredoc found in ${path}`);
  }
  return match[1] as string;
}

describe("the demo deploy scripts satisfy startup validation", () => {
  const config = readFileSync(CONFIG, "utf8");
  const required = [...requiredAlways(config), ...requiredInProduction(config)];

  it("finds the required variables at all", () => {
    // A refactor that empties this list would make the suite pass by
    // asking nothing.
    expect(required).toContain("DATABASE_URL");
    expect(required.length).toBeGreaterThanOrEqual(4);
  });

  /**
   * Scoped to the `.env` heredoc, which is the only thing the app reads.
   *
   * The first version of this test searched the whole file and passed
   * with the bug reintroduced: the name also appears where the secret is
   * generated and where it is persisted to the conf file, so a script
   * that produced the value and never wrote it to `.env` — exactly the
   * bug — looked fine. Checking the wrong text is how this test would
   * repeat the mistake it exists to catch.
   */
  it.each(SCRIPTS)("%s writes every required variable into .env", (path) => {
    const env = envBlock(readFileSync(path, "utf8"), path);
    const missing = required.filter(
      (variable) => !new RegExp(`^${variable}=`, "m").test(env),
    );
    expect(missing).toEqual([]);
  });

  /**
   * TRUSTED_PROXY is checked by hand rather than through `require`, so it
   * would not appear above. It is the easiest of the lot to miss: the
   * failure is not "missing" but "must be explicitly true or false".
   */
  it.each(SCRIPTS)("%s sets TRUSTED_PROXY explicitly", (path) => {
    expect(envBlock(readFileSync(path, "utf8"), path)).toMatch(
      /^TRUSTED_PROXY="(true|false)"$/m,
    );
  });

  /**
   * Secrets must survive a redeploy. A secret regenerated on every deploy
   * silently moves every band's future draws, and for the restock seed it
   * would change results that operators reason about.
   */
  it("persists each generated secret to the conf file", () => {
    const redeploy = readFileSync(SCRIPTS[1] as string, "utf8");
    for (const secret of [
      "RESTOCK_SEED_SECRET",
      "CRON_SECRET",
      "DAILY_ROTATION_SECRET",
    ]) {
      expect(redeploy).toContain(`echo "${secret}=`);
    }
  });
});
