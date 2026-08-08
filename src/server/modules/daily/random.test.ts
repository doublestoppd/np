/**
 * The shared draw helpers — and specifically the flavour-line fallback,
 * which was the live half of a silent divergence.
 *
 * `pickFlavorLine` existed twice. Foraging's copy fell back to "Nothing
 * this time."; fishing's fell back to `""`. That empty string goes
 * straight into `?notice=`, and `sanitizeFeedback` drops an empty notice —
 * so a fishing spot with an empty flavour block let a player spend one of
 * the day's casts and see nothing happen at all, while the identical
 * content mistake on a forage spot was harmless.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NOTHING_FOUND_FALLBACK,
  pickFlavorLine,
  pickWeighted,
  secureQuantity,
} from "./random";

describe("pickFlavorLine", () => {
  it("never returns an empty string, whatever the block", () => {
    // Every shape of "the author left it blank".
    for (const block of ["", "   ", "\n", "\n\n  \n", "\r\n"]) {
      expect(pickFlavorLine(block)).toBe(NOTHING_FOUND_FALLBACK);
      expect(pickFlavorLine(block).length).toBeGreaterThan(0);
    }
  });

  it("picks one whole line and trims it", () => {
    const lines = ["  The net comes up empty.  ", "Nothing but weed.", "A boot."];
    for (let i = 0; i < 40; i += 1) {
      expect(lines.map((line) => line.trim())).toContain(
        pickFlavorLine(lines.join("\n")),
      );
    }
  });

  it("returns the only line when there is one", () => {
    expect(pickFlavorLine("Just the one.")).toBe("Just the one.");
  });

  /**
   * The guard. A module that declares its own copy is free to give it a
   * different fallback, which is exactly what happened.
   */
  it("is not re-declared in any module", () => {
    const self = fileURLToPath(import.meta.url);
    const home = join(process.cwd(), "src/server/modules/daily/random.ts");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || path === self || path === home) continue;
        if (/function pickFlavorLine\b/.test(readFileSync(path, "utf8"))) {
          offenders.push(path.replace(process.cwd() + "/", ""));
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("secureQuantity", () => {
  it("stays within the inclusive range", () => {
    for (let i = 0; i < 200; i += 1) {
      const value = secureQuantity(2, 5);
      expect(value).toBeGreaterThanOrEqual(2);
      expect(value).toBeLessThanOrEqual(5);
    }
  });

  it("returns the bound when the range is a single value or inverted", () => {
    expect(secureQuantity(3, 3)).toBe(3);
    expect(secureQuantity(3, 1)).toBe(3);
  });
});

describe("pickWeighted", () => {
  it("refuses an empty pool rather than returning undefined", () => {
    expect(() => pickWeighted([])).toThrow();
  });

  it("never returns a zero-weight entry", () => {
    const entries = [
      { weight: 0, name: "never" },
      { weight: 5, name: "always" },
    ];
    for (let i = 0; i < 200; i += 1) {
      expect(pickWeighted(entries).name).toBe("always");
    }
  });
});
