import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_TINTS, TAG_TINTS, tintForItem } from "@/lib/content-tint";
import { itemCategories, itemTags } from "../../prisma/content/items/categories";

/**
 * Contrast guards for the palette.
 *
 * These exist because a palette is edited by eye and checked by nobody.
 * Every pairing below is one a component actually renders — muted text on
 * a card, a tinted badge, a struck-out word tile — and each is asserted at
 * the WCAG AA ratio for normal text. Two of them were already failing when
 * this file was written, quietly, in shipped code.
 *
 * Read from globals.css rather than duplicated here, so a token edit is
 * checked against the same value the browser gets.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");

function token(name: string): string {
  const match = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`no --color-${name} in globals.css`);
  return match[1];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) =>
    channel(parseInt(hex.slice(i, i + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(token(a)), luminance(token(b))];
  return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05));
}

/** Foreground/background pairs a component actually puts text on. */
const TEXT_PAIRS: Array<[string, string]> = [
  ["text", "background"],
  ["text", "surface"],
  ["text", "surface-raised"],
  ["text-muted", "surface"],
  ["text-muted", "background"],
  ["text-muted", "surface-sunken"],
  ["accent-contrast", "accent"],
  ["accent-strong", "accent-soft"],
  ["success", "success-soft"],
  ["warning", "warning-soft"],
  ["danger", "danger-soft"],
  // The word game's struck-out letters.
  ["text-muted", "tile-absent"],
  ["accent-contrast", "tile-exact"],
  ...(["berry", "ember", "honey", "moss", "tide", "dusk"].map((t) => [
    `tint-${t}`,
    `tint-${t}-soft`,
  ]) as Array<[string, string]>),
  ...(["common", "uncommon", "rare", "ultra"].map((r) => [
    `rarity-${r}`,
    `rarity-${r}-soft`,
  ]) as Array<[string, string]>),
];

describe("palette contrast", () => {
  it.each(TEXT_PAIRS)("%s on %s reaches AA for normal text", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws every item ink dark enough to read on the artwork wash", () => {
    // Artwork is not text, so AA does not apply — but a silhouette that
    // conveys which object this is has to clear the 3:1 that WCAG asks of
    // a meaningful non-text graphic. `pale` used to be in this rotation
    // and sat under 2:1.
    const wash = luminance(token("surface-sunken"));
    for (const category of Object.keys(CATEGORY_TINTS)) {
      for (const artKey of ["a", "ab", "abc", "abcd"]) {
        const { ink } = tintForItem(category, artKey);
        const l = luminance(ink);
        const [hi, lo] = [Math.max(l, wash), Math.min(l, wash)];
        expect((hi + 0.05) / (lo + 0.05), `${category}/${artKey} ${ink}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps the six content tints far enough apart to tell apart", () => {
    // A palette whose hues all resolve to the same grey is the state this
    // replaced. Not a contrast rule — a distinctness one.
    const tints = ["berry", "ember", "honey", "moss", "tide", "dusk"].map((t) =>
      token(`tint-${t}`),
    );
    expect(new Set(tints).size).toBe(tints.length);
    for (let i = 0; i < tints.length; i++) {
      for (let j = i + 1; j < tints.length; j++) {
        const a = tints[i] as string;
        const b = tints[j] as string;
        const distance = [1, 3, 5]
          .map((k) =>
            Math.abs(parseInt(a.slice(k, k + 2), 16) - parseInt(b.slice(k, k + 2), 16)),
          )
          .reduce((sum, d) => sum + d, 0);
        expect(distance, `${a} vs ${b}`).toBeGreaterThan(60);
      }
    }
  });
});

/**
 * Every authored category and tag must have a tint.
 *
 * A missing key is a silent fallback rather than an error — which is how
 * six categories came to be described as "the four" while twenty books and
 * five tokens rendered in the default ink. Checking against the content
 * rather than against the map's own keys is the whole point: iterating
 * `Object.keys(CATEGORY_TINTS)` proves only that the map agrees with
 * itself.
 */
describe("tints cover the content that exists", () => {
  it("has a tint for every item category", () => {
    const missing = itemCategories
      .map((category) => category.slug)
      .filter((slug) => CATEGORY_TINTS[slug] === undefined);
    expect(missing).toEqual([]);
  });

  it("has a tint for every item tag", () => {
    const missing = itemTags
      .map((tag) => tag.slug)
      .filter((slug) => TAG_TINTS[slug] === undefined);
    expect(missing).toEqual([]);
  });
});
