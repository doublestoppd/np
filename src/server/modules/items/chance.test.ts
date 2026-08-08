/**
 * The anti-treadmill rule, and a guard against it splitting in two again.
 *
 * It had already split: both runtime copies refused a token or a chit,
 * the validator refused both for the drums and only a chit for the chits.
 * A scratch card whose prize was a spin token therefore passed
 * `content:validate`, seeded cleanly, and threw at the player.
 *
 * A unit test of the predicate would not have caught that, because the
 * predicate was never wrong — the second copy was. So the static scan
 * below is the test that matters: it fails if anybody writes the rule
 * inline again anywhere in `src/` or `prisma/`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHANCE_ITEM_TYPES, isChanceItemType } from "./chance";

describe("the anti-treadmill predicate", () => {
  it("refuses both kinds of chance item", () => {
    expect(isChanceItemType("SPIN_TOKEN")).toBe(true);
    expect(isChanceItemType("SCRATCH_CARD")).toBe(true);
  });

  it("allows an ordinary prize", () => {
    for (const type of ["FOOD", "TOY", "BOOK", "CURIO", "FURNISHING"]) {
      expect(isChanceItemType(type)).toBe(false);
    }
  });

  it("treats a missing type as ordinary rather than throwing", () => {
    // The validator reads authored content where `type` may be absent.
    expect(isChanceItemType(null)).toBe(false);
    expect(isChanceItemType(undefined)).toBe(false);
  });

  it("names both kinds, so a new one has to be added deliberately", () => {
    expect([...CHANCE_ITEM_TYPES]).toEqual(["SPIN_TOKEN", "SCRATCH_CARD"]);
  });

  /**
   * The one that would have caught the real bug.
   *
   * Scoped to the shape the RULE takes, not to every mention of the two
   * types. Two other things legitimately compare against them and must
   * keep doing so:
   *
   * - `prisma/seed/validation.ts` asserts a card's item IS a
   *   `SCRATCH_CARD` and a token's IS a `SPIN_TOKEN`. That is identity —
   *   the opposite question, and it has one right answer per call site.
   * - `inventory/page.tsx` asks "is this a chit, so render the scratch
   *   dialog". That is presentation.
   *
   * The rule is "a PRIZE may not be a chance item", and it has exactly two
   * tells: a prize's type compared against one of the constants, or a
   * single expression naming both of them at once. Either is a second copy.
   */
  it("is not re-implemented inline anywhere", () => {
    const self = fileURLToPath(import.meta.url);
    const source = join(process.cwd(), "src");
    const seed = join(process.cwd(), "prisma");
    const prizeCompare =
      /prize\w*\.type\s*[=!]==?\s*["'](?:SPIN_TOKEN|SCRATCH_CARD)["']/i;
    const bothAtOnce =
      /["'](?:SPIN_TOKEN|SCRATCH_CARD)["'][^;\n]{0,40}\|\|[^;\n]{0,40}["'](?:SPIN_TOKEN|SCRATCH_CARD)["']/;
    const inline = {
      test: (text: string) => prizeCompare.test(text) || bothAtOnce.test(text),
    };
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules") continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || path === self) continue;
        if (inline.test(readFileSync(path, "utf8"))) {
          offenders.push(path.replace(process.cwd() + "/", ""));
        }
      }
    };
    walk(source);
    walk(seed);

    expect(offenders).toEqual([]);
  });
});
