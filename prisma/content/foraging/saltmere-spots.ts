import type { ForageSpotContent } from "../schemas";

const wracklineNothingLines = [
  "Rope, rope, more rope, and the boot. Always the boot.",
  "Nothing today. The line has been picked over by somebody keener.",
  "A promising shape resolves into a different piece of rope.",
  "The water brought nothing this time and seems unapologetic.",
  "You find the other boot. It is also a left boot.",
].join("\n");

const slipwayNothingLines = [
  "The mud gives you a firm handshake and nothing else.",
  "Something down there is holding on. You let it.",
  "Nothing, and one boot's worth of mud you will be finding later.",
  "The slipway is having a quiet day and would like that respected.",
  "You come up with a fistful of the flats and no news.",
].join("\n");

/**
 * Saltmere's foraging spots.
 *
 * Dapplewood's spots yield things that GREW there. These yield things
 * somebody LOST there, which is the difference between the two regions
 * stated as a pool. Five of the entries below are sold by no shop
 * anywhere — they exist only here and on the Found Counter's claims
 * board, which is what makes that board's rewards free of any arbitrage
 * route (ADR-25's rule, satisfied by a forage supply rather than a meal
 * supply).
 *
 * The tide in the copy is flavour. There is no window and no schedule,
 * and nothing here is missable.
 */
export const wracklineSpot = {
  slug: "wrackline-strand",
  regionSlug: "saltmere",
  locationSlug: "the-wrackline",
  name: "Along the Wrackline",
  description:
    "Whatever the water has finished with ends up in this line, sorted by nothing at all. Picking through it is normal. Taking it home is expected.",
  dailyLimit: 3,
  active: true,
  nothingWeight: 130,
  nothingFlavor: wracklineNothingLines,
  entries: [
    // The everyday band: other people's belongings, mostly.
    { itemSlug: "one-left-boot", selectionWeight: 200 },
    { itemSlug: "waterlogged-luggage-tag", selectionWeight: 190 },
    { itemSlug: "chipped-enamel-mug", selectionWeight: 160 },
    { itemSlug: "tide-worn-tin", selectionWeight: 150, minQuantity: 1, maxQuantity: 2 },
    { itemSlug: "honeyed-shoreberries", selectionWeight: 110, minQuantity: 1, maxQuantity: 2 },
    // Nicer, and often enough to be worth hoping for.
    { itemSlug: "bent-brass-hinge", selectionWeight: 55 },
    { itemSlug: "knotwork-ball", selectionWeight: 30 },
    { itemSlug: "beacon-lamp-glass", selectionWeight: 10 },
    // About once a year of searching every day. Instanced, so it will
    // carry "found along the wrackline" for the rest of its life.
    { itemSlug: "netted-glass-float", selectionWeight: 2 },
  ],
} satisfies ForageSpotContent;

export const slipwayMudSpot = {
  slug: "slipway-mud",
  regionSlug: "saltmere",
  locationSlug: "lowwater-landing",
  name: "Under the Slipway",
  description:
    "The mud under the slipway holds on to everything and gives it back slowly, in an order of its own choosing. Wear something you do not mind.",
  dailyLimit: 3,
  active: true,
  nothingWeight: 130,
  nothingFlavor: slipwayNothingLines,
  entries: [
    { itemSlug: "chipped-enamel-mug", selectionWeight: 200, minQuantity: 1, maxQuantity: 2 },
    { itemSlug: "tide-worn-tin", selectionWeight: 180, minQuantity: 1, maxQuantity: 2 },
    { itemSlug: "salt-rakers-tally", selectionWeight: 150 },
    { itemSlug: "one-left-boot", selectionWeight: 140 },
    { itemSlug: "waterlogged-luggage-tag", selectionWeight: 120 },
    { itemSlug: "bent-brass-hinge", selectionWeight: 70 },
    { itemSlug: "driftwood-whirligig", selectionWeight: 40 },
    { itemSlug: "beacon-lamp-glass", selectionWeight: 12 },
    { itemSlug: "salvagers-tide-clock", selectionWeight: 2 },
  ],
} satisfies ForageSpotContent;

export const saltmereForageSpots = [wracklineSpot, slipwayMudSpot];
