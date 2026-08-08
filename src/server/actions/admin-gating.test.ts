/**
 * Every admin surface must gate through `requireAdmin`.
 *
 * A server action is a public RPC endpoint: Next.js gives it an id and
 * anyone who knows the id can call it, signed in as anybody. The page not
 * appearing in the navigation protects nothing at all — the only thing
 * standing between a curious player and the reset button is an
 * authorisation check inside the action itself.
 *
 * This is a static check rather than an integration one on purpose: it
 * catches the *next* admin action, the one somebody adds in a hurry
 * beside the others, which is exactly the one that will forget.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ADMIN_ACTIONS = join(process.cwd(), "src/server/actions/admin.ts");
const ADMIN_PAGES = join(process.cwd(), "src/app/(game)/admin");

/** Exported async functions, by name, in declaration order. */
function exportedActions(source: string): string[] {
  return [...source.matchAll(/^export\s+async\s+function\s+(\w+)/gm)].map(
    (match) => match[1] as string,
  );
}

describe("admin surfaces are authorised server-side", () => {
  const source = readFileSync(ADMIN_ACTIONS, "utf8");

  it("finds the admin actions at all", () => {
    // A rename that empties this list would make the suite vacuously pass.
    expect(exportedActions(source).length).toBeGreaterThan(0);
  });

  it.each(exportedActions(source))(
    "%s calls requireAdmin before doing anything",
    (name) => {
      const start = source.indexOf(`export async function ${name}`);
      expect(start).toBeGreaterThanOrEqual(0);
      // The body up to the next export, so one action's check cannot
      // stand in for another's.
      const nextExport = source.indexOf("\nexport ", start + 1);
      const body = source.slice(start, nextExport === -1 ? undefined : nextExport);
      expect(body).toContain("await requireAdmin()");
      // And it must be the first await: a check that runs after the work
      // is not a check.
      const firstAwait = body.indexOf("await ");
      expect(body.slice(firstAwait, firstAwait + 30)).toContain("requireAdmin");
    },
  );

  it("never reaches for requireUser, which would let any player in", () => {
    expect(source).not.toContain("requireUser");
  });

  it.each(
    existsSync(ADMIN_PAGES)
      ? readdirSync(ADMIN_PAGES)
          .filter((name) => name.endsWith(".tsx"))
          .map((name) => join(ADMIN_PAGES, name))
      : [],
  )("%s gates its own render too", (path) => {
    const page = readFileSync(path, "utf8");
    expect(page).toContain("requireAdmin()");
    expect(page).not.toContain("requireUser()");
  });
});
