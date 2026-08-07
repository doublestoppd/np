import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocationScene } from "./location-scene";
import { LocationArt } from "./location-art";
import { PLACE_ICON_MAP } from "@/lib/art-credits";
import { gameContent } from "../../../prisma/content";

/**
 * The guard against the flaw this replaced: every Dapplewood location once
 * shared one identical backdrop and every Saltmere one another, so sixteen
 * places were two pictures with the subject swapped. These assert the
 * grounds are actually distinct, and stay distinct, without anyone having
 * to eyeball sixteen cards.
 */

/** Every seeded ground key: the two regions plus every location. */
const KEYS = Object.entries(PLACE_ICON_MAP).map(([artKey, { terrain }]) => ({
  artKey,
  terrain,
}));

describe("location scenes", () => {
  it("paints a different ground for every place", () => {
    const rendered = KEYS.map(({ artKey, terrain }) =>
      renderToStaticMarkup(
        <svg>
          <LocationScene artKey={artKey} terrain={terrain} />
        </svg>,
      ),
    );
    // No two grounds identical — the exact failure this feature exists to
    // remove.
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it("paints the same place the same way every time", () => {
    // Determinism: the ground is seeded from the key, so a card and its
    // hero and a reload must never disagree about what a place looks like.
    const scene = (
      <svg>
        <LocationScene artKey="the-mossy-market" terrain="wood" />
      </svg>
    );
    const once = renderToStaticMarkup(scene);
    const twice = renderToStaticMarkup(scene);
    expect(once).toBe(twice);
  });

  it("keeps a region's grounds in the region's palette", () => {
    // A wood scene must not paint itself in the flats' greys, or the one
    // thing that separates the two regions is gone. Checked by the sky
    // gradient stops, which come straight from the region palette.
    const wood = renderToStaticMarkup(
      <svg>
        <LocationScene artKey="mosslight-clearing" terrain="wood" />
      </svg>,
    );
    const flats = renderToStaticMarkup(
      <svg>
        <LocationScene artKey="lowwater-landing" terrain="flats" />
      </svg>,
    );
    // Woodland greens carry a green channel lead; the flats are neutral
    // greys. A cheap, stable proxy: the wood scene mentions a canopy green,
    // the flats never do.
    expect(wood).toMatch(/#5d8050|#6f9460|#547548|#4e7346/);
    expect(flats).not.toMatch(/#5d8050|#6f9460|#547548|#4e7346/);
  });

  it("gives every authored location and region a defined terrain", () => {
    const missing: string[] = [];
    for (const region of gameContent.regions) {
      if (!PLACE_ICON_MAP[region.artKey]) missing.push(region.slug);
      for (const location of region.locations) {
        const artKey = location.artKey ?? location.slug;
        if (!PLACE_ICON_MAP[artKey]) missing.push(artKey);
      }
    }
    expect(missing).toEqual([]);
  });

  it("still renders a location with its subject standing on the ground", () => {
    // The whole component, not just the ground: the sourced subject and
    // its shadow must survive the swap to seeded grounds.
    const html = renderToStaticMarkup(
      <LocationArt artKey="the-quiet-beacon" label="The Quiet Beacon" />,
    );
    expect(html).toContain('aria-label="The Quiet Beacon"');
    expect(html).toContain("/art/places/the-quiet-beacon.svg");
  });
});
