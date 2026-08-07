import type { ForageSpotContent } from "../schemas";

const mossNothingLines = [
  "Moss, moss, a beetle who would rather you didn't, and more moss.",
  "You come away with damp knees and nothing else.",
  "Something was here recently. It is not here now.",
  "A very promising lump turns out to be a different, less promising lump.",
  "Nothing. The clearing declines to explain itself.",
].join("\n");

const waterNothingLines = [
  "Pebbles. Thousands of them. None of them the interesting kind.",
  "The river offers a stick. You decline. It offers the stick again.",
  "You reach in up to the elbow and retrieve a colder elbow.",
  "Nothing today. The current has opinions about timing.",
  "A shape below the surface turns out to be the surface.",
].join("\n");

/**
 * Dapplewood's foraging spots.
 *
 * These sit at the two locations that previously hosted nothing —
 * Mosslight Clearing and the Old Footbridge — which is the point: a
 * flavour page is a nicer place to stand when there is a reason to stand
 * there, and neither location needed a shop to earn one.
 *
 * Pools yield ORDINARY ITEMS, never coins. The value that leaves a spot
 * reaches a player's wallet only by passing through the market, which
 * moves coins between players rather than minting them.
 *
 * Weights are relative within a spot. The shape is deliberate: a thick
 * band of everyday things, a thin band of nicer ones, and exactly one
 * entry per spot that will happen to somebody a few times a year. That
 * last line is what makes the button worth pressing on an ordinary
 * Tuesday, and it must stay rare enough that nobody plans around it.
 */
export const mosslightClearingSpot = {
  slug: "mosslight-undergrowth",
  regionSlug: "dapplewood",
  locationSlug: "mosslight-clearing",
  name: "Under the Moss and Fern",
  description:
    "The moss here is deep enough to lose a thing in, and generations have. Kneeling and having a feel about is entirely normal behaviour and nobody will comment.",
  dailyLimit: 3,
  active: true,
  // Roughly one search in seven. Enough that a find is a small event
  // rather than a dispensed portion; not so much that the button feels
  // like a waste of a tap.
  nothingWeight: 130,
  nothingFlavor: mossNothingLines,
  entries: [
    // The everyday band: what you almost always come back with.
    { itemSlug: "unremarkable-acorn", selectionWeight: 200, minQuantity: 1, maxQuantity: 3 },
    { itemSlug: "sunberry-cluster", selectionWeight: 200, minQuantity: 1, maxQuantity: 2 },
    { itemSlug: "pressed-fern-frond", selectionWeight: 180 },
    { itemSlug: "crispleaf-salad", selectionWeight: 120 },
    // Nicer, and often enough to be worth hoping for.
    { itemSlug: "woven-fern-bookmark", selectionWeight: 60 },
    { itemSlug: "mossberry-jam", selectionWeight: 30 },
    { itemSlug: "toasted-nutcake", selectionWeight: 25 },
    { itemSlug: "sunshower-vial", selectionWeight: 8 },
    // Weight 1 against ~950: about once every 300 days of searching
    // every day. Rare enough to be a story, and far too rare to plan
    // around, which is the whole job of this line.
    { itemSlug: "gilded-acorn", selectionWeight: 1 },
  ],
} satisfies ForageSpotContent;

export const oldFootbridgeSpot = {
  slug: "footbridge-shallows",
  regionSlug: "dapplewood",
  locationSlug: "old-footbridge",
  name: "The Slow Water",
  description:
    "Below the bridge the river gives up whatever it has finished carrying. Mostly pebbles. Occasionally not.",
  dailyLimit: 3,
  active: true,
  nothingWeight: 130,
  nothingFlavor: waterNothingLines,
  entries: [
    { itemSlug: "painted-river-pebble", selectionWeight: 200, minQuantity: 1, maxQuantity: 2 },
    { itemSlug: "riverweed-crisps", selectionWeight: 180, minQuantity: 1, maxQuantity: 2 },
    { itemSlug: "river-glass-pebble", selectionWeight: 150 },
    { itemSlug: "river-melon-slice", selectionWeight: 120 },
    { itemSlug: "dewdrop-vial", selectionWeight: 90 },
    { itemSlug: "mossy-brass-button", selectionWeight: 70 },
    { itemSlug: "tiny-copper-bell", selectionWeight: 40 },
    { itemSlug: "echo-shell", selectionWeight: 6 },
    // About once a year of daily searching. One of a kind, and it will
    // carry the story of where it came from:
    // "found in the shallows" is a real provenance, which is exactly why
    // a spot may grant an instanced item where a page-view event may not
    // (docs/architecture-decisions.md ADR-28).
    { itemSlug: "moonglass-teacup", selectionWeight: 2 },
  ],
} satisfies ForageSpotContent;

export const forageSpots = [mosslightClearingSpot, oldFootbridgeSpot];
