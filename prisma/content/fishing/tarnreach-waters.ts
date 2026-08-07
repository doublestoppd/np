import type { FishingSpotContent } from "../schemas";

/**
 * The two tarns.
 *
 * The difference between them is the whole reason there are two: the same
 * species runs measurably bigger in the upper tarn, and the rarer fish
 * only live up there. An hour's walk buys size, not a different button.
 *
 * Weights are relative within a spot, like foraging pools — a fishing
 * table is edited by adding and removing lines, and forcing a rebalance
 * of every other line to add one would make authoring miserable.
 */
export const fishingSpots = [
  {
    slug: "lower-tarn-shallows",
    regionSlug: "tarnreach",
    locationSlug: "the-lower-tarn",
    name: "The Shallows",
    description:
      "Scree shelving into black water. Whatever is down there comes up to the edge in the early part of the day, which is most of what anyone knows about it.",
    dailyLimit: 6,
    emptyWeight: 900,
    emptyFlavor: [
      "The float sits there. So do you.",
      "Something took an interest and thought better of it.",
      "Nothing. The water is very good at nothing.",
      "A long wait, and then a slightly longer one.",
    ].join("\n"),
    entries: [
      { itemSlug: "stone-loach", selectionWeight: 320, minLength: 6, maxLength: 14 },
      { itemSlug: "silver-dace", selectionWeight: 260, minLength: 10, maxLength: 22 },
      { itemSlug: "speckled-char", selectionWeight: 170, minLength: 18, maxLength: 34 },
      { itemSlug: "moonscale-trout", selectionWeight: 70, minLength: 24, maxLength: 41 },
      { itemSlug: "glass-perch", selectionWeight: 12, minLength: 20, maxLength: 33 },
      { itemSlug: "old-grandfather-pike", selectionWeight: 4, minLength: 55, maxLength: 84 },
    ],
  },
  {
    slug: "upper-tarn-deeps",
    regionSlug: "tarnreach",
    locationSlug: "the-upper-tarn",
    name: "The Deeps",
    description:
      "Cold enough that the line stiffens. The bottom has not been found, which the boathouse mentions as a selling point and the stonesetter mentions as a warning.",
    dailyLimit: 4,
    emptyWeight: 1400,
    emptyFlavor: [
      "Nothing, for a long time, in a very beautiful place.",
      "The line comes back exactly as it went out.",
      "Cold hands, empty hook, no complaints.",
      "Something enormous did not happen.",
    ].join("\n"),
    entries: [
      { itemSlug: "silver-dace", selectionWeight: 150, minLength: 14, maxLength: 27 },
      { itemSlug: "speckled-char", selectionWeight: 210, minLength: 26, maxLength: 45 },
      { itemSlug: "moonscale-trout", selectionWeight: 160, minLength: 33, maxLength: 58 },
      { itemSlug: "deepwater-char", selectionWeight: 120, minLength: 40, maxLength: 72 },
      { itemSlug: "glass-perch", selectionWeight: 45, minLength: 28, maxLength: 49 },
      { itemSlug: "old-grandfather-pike", selectionWeight: 20, minLength: 70, maxLength: 118 },
      { itemSlug: "tarn-ghost", selectionWeight: 2, minLength: 30, maxLength: 96 },
    ],
  },
] satisfies FishingSpotContent[];
