import { describe, expect, it } from "vitest";
import {
  counterDigits,
  COUNTER_DIGITS,
  parseStickers,
  serializeStickers,
  STICKER_LIMIT,
  STICKERS,
  themeList,
  themeStyle,
  THEMES,
} from "./themes";

/**
 * The Shrine's decoration catalogue (ADR-69).
 *
 * The properties worth pinning are the ones that keep a player's page from
 * becoming an attack: a sticker key that is not in the catalogue must never
 * survive a round trip, and the theme record must cover every value the
 * database can hold.
 */

describe("the themes", () => {
  it("cover every theme the schema allows", () => {
    // `THEMES` is typed `Record<ShrineTheme, ThemeSpec>`, so a missing one
    // is a compile error. This catches the other direction: an entry that
    // is present but empty would type-check and render a blank page.
    for (const { key, spec } of themeList()) {
      expect(spec.name, key).toBeTruthy();
      expect(spec.page, key).toBeTruthy();
      // Without a tile size a radial-gradient paints once across the whole
      // page: the starfield was two dots until this existed.
      expect(spec.pageSize, key).toBeTruthy();
      expect(spec.ink, key).toBeTruthy();
      expect(spec.font, key).toBeTruthy();
    }
    expect(themeList().length).toBeGreaterThanOrEqual(8);
  });

  it("give every theme its own look", () => {
    // Two themes with identical values are one theme with two names.
    const looks = themeList().map(({ spec }) => `${spec.page}|${spec.ink}`);
    expect(new Set(looks).size).toBe(looks.length);
  });

  it("hand the page a complete set of custom properties", () => {
    for (const { key } of themeList()) {
      const style = themeStyle(key);
      for (const property of [
        "--shrine-page",
        "--shrine-page-size",
        "--shrine-panel",
        "--shrine-ink",
        "--shrine-glow",
        "--shrine-edge",
        "--shrine-font",
        "--shrine-display",
      ]) {
        expect(style[property], `${key} ${property}`).toBeTruthy();
      }
    }
  });

  it("names every theme in the record it is keyed by", () => {
    expect(Object.keys(THEMES)).toContain("TERMINAL");
  });
});

describe("the stickers", () => {
  it("refuse a key that is not in the catalogue", () => {
    // The whole reason stickers are keys rather than text: an unknown one
    // is dropped rather than rendered.
    expect(serializeStickers(["construction", "<script>", "nope"])).toBe(
      "construction",
    );
    expect(parseStickers("construction,<script>")).toHaveLength(1);
  });

  it("drop duplicates, keeping the first", () => {
    expect(serializeStickers(["moon", "moon", "cat"])).toBe("moon,cat");
    expect(parseStickers("moon,moon,cat").map((s) => s.key)).toEqual([
      "moon",
      "cat",
    ]);
  });

  it("never let more than the limit through, in either direction", () => {
    const everything = STICKERS.map((sticker) => sticker.key);
    expect(everything.length).toBeGreaterThan(STICKER_LIMIT);
    expect(serializeStickers(everything).split(",")).toHaveLength(
      STICKER_LIMIT,
    );
    // And a row stored before the limit changed cannot overflow the wall.
    expect(parseStickers(everything.join(","))).toHaveLength(STICKER_LIMIT);
  });

  it("survives a round trip unchanged", () => {
    const chosen = ["ring", "cocoa", "handmade"];
    expect(parseStickers(serializeStickers(chosen)).map((s) => s.key)).toEqual(
      chosen,
    );
  });

  it("tolerates the empty column a fresh shrine has", () => {
    expect(parseStickers("")).toEqual([]);
    expect(serializeStickers([])).toBe("");
  });
});

describe("the visitor counter", () => {
  it("pads to six digits, because that is the joke", () => {
    expect(counterDigits(0).join("")).toBe("000000");
    expect(counterDigits(41).join("")).toBe("000041");
    expect(counterDigits(41)).toHaveLength(COUNTER_DIGITS);
  });

  it("clamps rather than overflowing the odometer", () => {
    // A seven-digit count would render a seven-digit box and shove the
    // layout sideways; a real odometer rolls over instead of growing.
    expect(counterDigits(9_999_999)).toHaveLength(COUNTER_DIGITS);
    expect(counterDigits(9_999_999).join("")).toBe("999999");
    // And a negative — which the database CHECK forbids — would render as
    // "00000-" if it were ever reached by another route.
    expect(counterDigits(-5).join("")).toBe("000000");
  });
});
