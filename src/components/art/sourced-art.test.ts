import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEM_ICON_KEYS, PLACE_ICON_KEYS } from "./sourced-icons";
import {
  ICON_AUTHORS,
  ITEM_ICON_MAP,
  KEEPER_ICON_MAP,
  PLACE_ICON_MAP,
} from "@/lib/art-credits";
import { gameContent } from "../../../prisma/content";

/**
 * The sourced artwork's guards. All of these exist because the failure
 * they catch is silent: a missing file renders as a coloured square, an
 * uncredited contributor is a licence breach, and two things sharing a
 * silhouette makes a list unreadable without anything looking broken.
 */

const SETS = [
  { name: "items", dir: "public/art/items", keys: ITEM_ICON_KEYS },
  { name: "places", dir: "public/art/places", keys: PLACE_ICON_KEYS },
] as const;

/** Every sourced icon in one flat list, for credit and format checks. */
const ALL_ICONS = [
  ...Object.values(ITEM_ICON_MAP),
  ...Object.values(PLACE_ICON_MAP).map(({ icon }) => icon),
  ...Object.values(KEEPER_ICON_MAP),
];

describe("sourced icons", () => {
  it.each(SETS)("ships a file for every key $name claims", ({ dir, keys }) => {
    const missing = [...keys].filter((key) => !existsSync(`${dir}/${key}.svg`));
    expect(missing).toEqual([]);
  });

  it("claims exactly what the maps declare", () => {
    expect([...ITEM_ICON_KEYS].sort()).toEqual(
      Object.keys(ITEM_ICON_MAP).sort(),
    );
    expect([...PLACE_ICON_KEYS].sort()).toEqual(
      [...Object.keys(PLACE_ICON_MAP), ...Object.keys(KEEPER_ICON_MAP)].sort(),
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

  it("gives every region and location a subject", () => {
    // The world map used to render each region as a bare backdrop with a
    // caption, which is a picture of nothing.
    const placeless: string[] = [];
    for (const region of gameContent.regions) {
      if (!PLACE_ICON_KEYS.has(region.artKey)) placeless.push(region.slug);
      for (const location of region.locations) {
        const artKey = location.artKey ?? location.slug;
        if (!PLACE_ICON_KEYS.has(artKey)) placeless.push(artKey);
      }
    }
    expect(placeless).toEqual([]);
  });

  it("gives every shopkeeper a portrait", () => {
    const faceless = gameContent.npcShops
      .map((shop) => shop.keeperArtKey)
      .filter((artKey): artKey is string => Boolean(artKey))
      .filter((artKey) => !PLACE_ICON_KEYS.has(artKey));
    expect(faceless).toEqual([]);
  });

  it("never gives two things in one set the same silhouette", () => {
    // Allowed across sets — a place and an object never appear beside
    // each other — but never within one, because a list is scanned by
    // shape before it is read.
    for (const map of [
      ITEM_ICON_MAP,
      Object.fromEntries(
        Object.entries(PLACE_ICON_MAP).map(([key, { icon }]) => [key, icon]),
      ),
    ]) {
      const byIcon = new Map<string, string[]>();
      for (const [artKey, icon] of Object.entries(map)) {
        byIcon.set(icon, [...(byIcon.get(icon) ?? []), artKey]);
      }
      expect([...byIcon.entries()].filter(([, k]) => k.length > 1)).toEqual([]);
    }
  });

  it("credits every contributor it borrows from", () => {
    const used = new Set(ALL_ICONS.map((icon) => icon.split("/")[0] as string));
    expect([...used].filter((author) => !ICON_AUTHORS[author])).toEqual([]);

    // The credit has to be somewhere a player can reach, not only in a
    // constant: CC BY asks for attribution, and a name in a source file
    // nobody renders is not attribution.
    const credits = readFileSync("docs/art-credits.md", "utf8");
    for (const author of used) {
      expect(credits).toContain(ICON_AUTHORS[author]?.name as string);
    }
  });

  it.each(SETS)(
    "strips the background in $name so a mask cannot paint a solid square",
    ({ dir, keys }) => {
      // Every upstream icon is a full-viewport black rectangle plus the
      // shape. Left in, it masks the whole box and the subject renders as
      // a coloured tile — which reads as a styling bug, not a missing
      // asset.
      for (const key of keys) {
        const svg = readFileSync(`${dir}/${key}.svg`, "utf8");
        expect(svg, key).not.toContain("M0 0h512v512H0z");
        expect(svg, key).toContain("<path");
      }
    },
  );
});
