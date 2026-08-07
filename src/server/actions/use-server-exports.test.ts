/**
 * A "use server" module may only export async functions. Next.js turns
 * every export into a callable RPC endpoint, so a plain constant is a
 * runtime error — one that TypeScript accepts and `next build` accepts,
 * and that only shows up when a page importing the module is requested.
 *
 * That is exactly how it got shipped once: an exported `initialState`
 * object beside the action it belonged to, which typechecked, built, and
 * then broke every location page carrying a request board.
 *
 * Types are erased before any of this matters, so `export type` and
 * `export interface` are fine and stay allowed.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ACTIONS_DIR = join(process.cwd(), "src/server/actions");

function serverActionFiles(): string[] {
  return readdirSync(ACTIONS_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(ACTIONS_DIR, name))
    .filter((path) => /^["']use server["'];/m.test(readFileSync(path, "utf8")));
}

/** `export const|let|var` that is not immediately an (async) function. */
const VALUE_EXPORT =
  /^export\s+(?:const|let|var)\s+\w+[^=\n]*=\s*(?!(?:async\s+)?(?:function\b|\())/gm;

describe('"use server" module exports', () => {
  const files = serverActionFiles();

  it("finds the server-action modules at all", () => {
    // A rename that empties this list would make the suite vacuously pass.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s exports only functions and types", (path) => {
    const source = readFileSync(path, "utf8");
    const offenders = [...source.matchAll(VALUE_EXPORT)].map((match) =>
      match[0].trim(),
    );
    expect(offenders).toEqual([]);
    // `export default` of anything but a function has the same problem.
    expect(/^export\s+default\s+(?!(?:async\s+)?function\b)/m.test(source)).toBe(
      false,
    );
  });
});
