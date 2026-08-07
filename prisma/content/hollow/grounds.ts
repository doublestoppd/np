import type { HollowGroundContent, HollowGroundPriceContent } from "../schemas";

/**
 * Painted grounds and the eight places a furnishing can stand in each.
 *
 * Eight anchors, always, in every ground, forever. Anchor count is not for
 * sale: within a ground you own more furnishings than fit, so arranging is
 * a real choice, and no amount of money can flood a picture until it stops
 * being composed. Capacity is bought by the *ground*, never by the slot.
 *
 * Anchors carry a place, a size, and a depth — nothing else. There is no
 * behaviour here and there must never be.
 */
export const hollowGrounds = [
  {
    key: "lantern-clearing",
    name: "The Lantern Clearing",
    description:
      "A flat clearing where the trees leave a gap, as though something used to stand here and the wood is politely waiting for it to come back.",
    artKey: "hollow-lantern-clearing",
    anchors: [
      { key: "far-treeline", label: "The far treeline", maxSize: "LARGE", x: 20, y: 40, depth: 0 },
      { key: "under-the-eaves", label: "Under the eaves", maxSize: "MEDIUM", x: 79, y: 43, depth: 1 },
      { key: "the-middle", label: "The middle of the clearing", maxSize: "CENTREPIECE", x: 50, y: 57, depth: 2 },
      { key: "left-verge", label: "The left verge", maxSize: "MEDIUM", x: 15, y: 63, depth: 3 },
      // Small on purpose: the clearing opens with three worn things
      // already standing in its small places, and a new Hollow should
      // still have somewhere to put a fourth without clearing one first.
      { key: "right-verge", label: "The right verge", maxSize: "SMALL", x: 85, y: 65, depth: 4 },
      { key: "the-path-in", label: "The path in", maxSize: "SMALL", x: 26, y: 78, depth: 5 },
      { key: "beside-the-path", label: "Beside the path", maxSize: "SMALL", x: 74, y: 80, depth: 6 },
      { key: "underfoot", label: "Underfoot", maxSize: "SMALL", x: 50, y: 91, depth: 7 },
    ],
  },
  {
    key: "shallow-bank",
    name: "The Shallow Bank",
    description:
      "Where the water gives up being a river and settles for being nearby. Everything here is a little damp and entirely unbothered about it.",
    artKey: "hollow-shallow-bank",
    anchors: [
      { key: "far-shore", label: "The far shore", maxSize: "LARGE", x: 72, y: 36, depth: 0 },
      { key: "the-willow", label: "Under the leaning willow", maxSize: "LARGE", x: 18, y: 42, depth: 1 },
      { key: "the-crossing", label: "The crossing", maxSize: "CENTREPIECE", x: 47, y: 55, depth: 2 },
      { key: "upstream", label: "Upstream", maxSize: "MEDIUM", x: 82, y: 60, depth: 3 },
      { key: "the-shallows", label: "In the shallows", maxSize: "SMALL", x: 30, y: 70, depth: 4 },
      { key: "near-bank", label: "The near bank", maxSize: "MEDIUM", x: 63, y: 76, depth: 5 },
      { key: "the-reeds", label: "Among the reeds", maxSize: "SMALL", x: 13, y: 82, depth: 6 },
      { key: "the-mud", label: "The good mud", maxSize: "SMALL", x: 45, y: 92, depth: 7 },
    ],
  },
  {
    key: "walled-garden",
    name: "The Walled Garden",
    description:
      "Four walls, one gate, and no record of who built any of it. Whatever was planted here first has long since decided the layout itself.",
    artKey: "hollow-walled-garden",
    anchors: [
      { key: "the-back-wall", label: "Against the back wall", maxSize: "LARGE", x: 50, y: 34, depth: 0 },
      { key: "the-north-corner", label: "The north corner", maxSize: "MEDIUM", x: 14, y: 45, depth: 1 },
      { key: "the-east-corner", label: "The east corner", maxSize: "MEDIUM", x: 86, y: 46, depth: 2 },
      { key: "the-centre-bed", label: "The centre bed", maxSize: "CENTREPIECE", x: 50, y: 60, depth: 3 },
      { key: "the-long-border", label: "The long border", maxSize: "MEDIUM", x: 22, y: 70, depth: 4 },
      { key: "the-short-border", label: "The short border", maxSize: "SMALL", x: 78, y: 73, depth: 5 },
      { key: "the-gate", label: "By the gate", maxSize: "SMALL", x: 60, y: 85, depth: 6 },
      { key: "the-gravel", label: "On the gravel", maxSize: "SMALL", x: 33, y: 90, depth: 7 },
    ],
  },
  {
    key: "high-shelf",
    name: "The High Shelf",
    description:
      "A ledge of rock with a view of most of everything. Wind most days. Worth it on the others.",
    artKey: "hollow-high-shelf",
    anchors: [
      { key: "the-drop", label: "At the drop", maxSize: "MEDIUM", x: 78, y: 38, depth: 0 },
      { key: "the-back-rock", label: "Against the back rock", maxSize: "LARGE", x: 24, y: 41, depth: 1 },
      { key: "the-outlook", label: "The outlook", maxSize: "CENTREPIECE", x: 52, y: 56, depth: 2 },
      { key: "the-windward-side", label: "The windward side", maxSize: "MEDIUM", x: 86, y: 63, depth: 3 },
      { key: "the-lee", label: "In the lee", maxSize: "MEDIUM", x: 15, y: 67, depth: 4 },
      { key: "the-scramble", label: "The scramble up", maxSize: "SMALL", x: 36, y: 80, depth: 5 },
      { key: "the-cairn", label: "Where the cairn was", maxSize: "SMALL", x: 66, y: 84, depth: 6 },
      { key: "the-flat-stone", label: "On the flat stone", maxSize: "SMALL", x: 50, y: 92, depth: 7 },
    ],
  },
] satisfies readonly HollowGroundContent[];

/**
 * What your *next* ground costs, by how many you already hold.
 *
 * The price is set by the count, never by which picture you pick, so
 * choosing a ground is only ever an aesthetic choice. Rung 0 is free: a
 * Hollow is somewhere you already live, not something you unlock.
 *
 * Sized against an engaged player netting roughly 490 coins a day and a
 * casual one netting roughly 255 (see docs/architecture-decisions.md
 * ADR-39). Ground two lands at about twelve days of engaged play — the
 * "I saved three weeks for this" beat the genre runs on — and it is
 * deliberately the *first* rung rather than the last.
 */
export const hollowGroundPrices = [
  { order: 0, price: 0n },
  { order: 1, price: 6_000n },
  { order: 2, price: 18_000n },
  { order: 3, price: 45_000n },
] satisfies readonly HollowGroundPriceContent[];
