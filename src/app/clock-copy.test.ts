/**
 * The clock and the copy have to speak the same language.
 *
 * The footer shows "GST 23:41". If a page next to it says a thing resets
 * at "midnight UTC", the player has to already know those are the same
 * clock — and the whole reason the clock exists is that they had no way
 * to know. This fails the build on the next daily activity that ships
 * with the old wording.
 *
 * Comments are exempt: UTC is the technically correct name and a
 * developer reading the source should see it. So is the admin screen,
 * which labels its own clock "Server time (UTC)" and is read by an
 * operator working from docs/operations.md.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PLAYER_FACING = [
  join(process.cwd(), "src/components"),
  join(process.cwd(), "src/app"),
];

/** Rough but sufficient: JSX prose is never on a comment line. */
function proseLines(source: string): string[] {
  return source.split("\n").filter((line) => {
    const trimmed = line.trim();
    return (
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("/*")
    );
  });
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // The admin surfaces speak UTC on purpose.
      if (entry.name === "admin") continue;
      walk(path, out);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      // Tests are excluded, this one included: it has to name the string
      // in order to search for it.
      out.push(path);
    }
  }
  return out;
}

describe("player-facing copy names the clock the player can see", () => {
  const files = PLAYER_FACING.flatMap((dir) => walk(dir));

  it("finds files to check at all", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("never says 'midnight UTC' where a player will read it", () => {
    // Joined and re-spaced before searching, because JSX prose wraps
    // wherever the formatter decides and the reader sees a sentence, not
    // lines. One offender hid here for real: "midnight" ended a line and
    // "UTC" began the next, so a per-line search walked straight past it
    // until a reformat happened to put them back together.
    const offenders = files.filter((path) =>
      proseLines(readFileSync(path, "utf8"))
        .join(" ")
        .replace(/\s+/g, " ")
        .includes("midnight UTC"),
    );
    expect(offenders).toEqual([]);
  });
});
