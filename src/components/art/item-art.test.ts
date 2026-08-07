import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEM_ICON_KEYS } from "./item-icons";
import { ICON_AUTHORS, ITEM_ICON_MAP } from "@/lib/art-credits";
import { gameContent } from "../../../prisma/content";

/**
 * The item artwork's guards. All of these exist because the failure they
 * catch is silent: a missing file renders as a coloured square, an
 * uncredited contributor is a licence breach, and two items sharing a
 * silhouette makes a satchel unreadable without anything looking broken.
 */

describe("item icons", () => {
  it("ships a file for every key it claims", () => {
    const missing = [...ITEM_ICON_KEYS].filter(
      (key) => !existsSync(`public/art/items/${key}.svg`),
    );
    expect(missing).toEqual([]);
  });

  it("claims exactly what the map declares", () => {
    expect([...ITEM_ICON_KEYS].sort()).toEqual(
      Object.keys(ITEM_ICON_MAP).sort(),
    );
  });

  it("gives every authored item its own artwork", () => {
    // Not a coverage nicety: the previous placeholder drew one of four
    // shapes per category, so a Chipped Enamel Mug and a Salt Raker's
    // Tally were the same picture. Anything left uncovered here silently
    // returns to that.
    const unillustrated = gameContent.items
      .map((item) => item.artKey ?? item.slug)
      .filter((artKey) => !ITEM_ICON_KEYS.has(artKey));
    expect(unillustrated).toEqual([]);
  });

  it("never gives two items the same silhouette", () => {
    const byIcon = new Map<string, string[]>();
    for (const [artKey, icon] of Object.entries(ITEM_ICON_MAP)) {
      byIcon.set(icon, [...(byIcon.get(icon) ?? []), artKey]);
    }
    const shared = [...byIcon.entries()].filter(([, keys]) => keys.length > 1);
    expect(shared).toEqual([]);
  });

  it("credits every contributor it borrows from", () => {
    const used = new Set(
      Object.values(ITEM_ICON_MAP).map((icon) => icon.split("/")[0] as string),
    );
    const uncredited = [...used].filter((author) => !ICON_AUTHORS[author]);
    expect(uncredited).toEqual([]);

    // The credit has to be somewhere a player can reach, not only in a
    // constant: CC BY asks for attribution, and a name in a source file
    // nobody renders is not attribution.
    const credits = readFileSync("docs/art-credits.md", "utf8");
    for (const author of used) {
      expect(credits).toContain(ICON_AUTHORS[author]?.name as string);
    }
  });

  it("strips the background so a mask cannot paint a solid square", () => {
    // Every upstream icon is a full-viewport black rectangle plus the
    // shape. Left in, it masks the whole box and the item renders as a
    // coloured tile — which reads as a styling bug, not a missing asset.
    for (const key of ITEM_ICON_KEYS) {
      const svg = readFileSync(`public/art/items/${key}.svg`, "utf8");
      expect(svg, key).not.toContain("M0 0h512v512H0z");
      expect(svg, key).toContain("<path");
    }
  });
});
