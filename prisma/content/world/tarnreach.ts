import type { RegionContent } from "../schemas";

/**
 * Placeholder world content — names and copy are deliberately provisional
 * and safe to replace before the final world identity is decided
 * (docs/design-philosophy.md).
 *
 * Tarnreach is the third texture. Dapplewood is horizontal and warm and
 * you stay in it; Saltmere is flat and grey and you pick through it.
 * Tarnreach is vertical and cold and clear, and what you do in it is
 * WAIT — for a fish, for the weather, for the kettle. Dapplewood's verb is
 * "linger", Saltmere's is "pick through it", Tarnreach's is "sit still".
 *
 * Everything here is further away than it looks, and the copy says so
 * more than once on purpose. Water is deep and motionless rather than
 * tidal, which is what keeps it from reading as Saltmere with hills.
 */
export const tarnreach = {
  slug: "tarnreach",
  name: "Tarnreach",
  description:
    "High cold country where the water sits in stone bowls and does not move. Everything is further away than it looks, including the far side of anything.",
  artKey: "tarnreach",
  sortOrder: 2,
  published: true,
  locations: [
    {
      slug: "the-lower-tarn",
      name: "The Lower Tarn",
      description:
        "A black oval of water in a bowl of scree, so still it is easier to believe it is stone. Fish rise in it anyway, which nobody has satisfactorily explained.",
      artKey: "the-lower-tarn",
      sortOrder: 0,
      published: true,
      mapX: 34,
      mapY: 62,
      activities: [
        { type: "FISHING", activityKey: "lower-tarn-shallows", displayOrder: 0 },
      ],
    },
    {
      slug: "the-boathouse",
      name: "The Boathouse",
      description:
        "One boat, considerable rope, and a counter that sells what the weather has taught people to want. The boat has not been in the water within living memory.",
      artKey: "the-boathouse",
      sortOrder: 1,
      published: true,
      mapX: 20,
      mapY: 44,
      activities: [
        { type: "NPC_SHOP", activityKey: "boathouse-counter", displayOrder: 0 },
      ],
    },
    {
      slug: "the-warming-hut",
      name: "The Warming Hut",
      description:
        "A stone box with a stove in it, kept lit by whoever passes. There is always something hot and there is never a charge; the notice explaining why has weathered to nothing.",
      artKey: "the-warming-hut",
      sortOrder: 2,
      published: true,
      mapX: 52,
      mapY: 34,
      activities: [
        { type: "DAILY_DRINK", activityKey: "warming-hut", displayOrder: 0 },
      ],
    },
    {
      slug: "the-stonesetters-hut",
      name: "The Stonesetter's Hut",
      description:
        "Cut stone in matched pairs, laid face-down on a long table to be sorted by touch and memory. The stonesetter insists this is work and not a game.",
      artKey: "the-stonesetters-hut",
      sortOrder: 3,
      published: true,
      mapX: 68,
      mapY: 56,
      activities: [
        {
          type: "MATCHING_GAME",
          activityKey: "stonesetters-table",
          displayOrder: 0,
        },
      ],
    },
    {
      slug: "the-upper-tarn",
      name: "The Upper Tarn",
      description:
        "Another hour up, and colder for it. The water here is deep enough that nobody has bothered to find out how deep, and what lives in it grows accordingly.",
      artKey: "the-upper-tarn",
      sortOrder: 4,
      published: true,
      mapX: 80,
      mapY: 20,
      activities: [
        { type: "FISHING", activityKey: "upper-tarn-deeps", displayOrder: 0 },
      ],
    },
    {
      slug: "the-morning-slate",
      name: "The Morning Slate",
      description:
        "A slate the size of a door, ruled into squares and chalked fresh at first light with the same numbers for everyone in the valley. Working it is what people do while the kettle goes.",
      artKey: "the-morning-slate",
      sortOrder: 8,
      published: true,
      mapX: 58,
      mapY: 68,
      activities: [
        { type: "SUDOKU", activityKey: "the-morning-slate", displayOrder: 0 },
      ],
    },
    {
      slug: "windward-steps",
      name: "Windward Steps",
      description:
        "Two hundred and some cut steps up the exposed side. Nobody agrees on the number because nobody has ever counted them on the way up.",
      artKey: "windward-steps",
      sortOrder: 5,
      // A flavour page, and deliberately so: a region where every location
      // has a button is a menu rather than a place. Tarnreach keeps three.
      published: true,
      mapX: 44,
      mapY: 78,
    },
    {
      slug: "the-cairn-field",
      name: "The Cairn Field",
      description:
        "Hundreds of stacked stones, none of them marking anything. Adding one is traditional. Knocking one over is not.",
      artKey: "the-cairn-field",
      sortOrder: 6,
      published: true,
      mapX: 14,
      mapY: 22,
    },
    {
      slug: "coldspring-well",
      name: "Coldspring Well",
      description:
        "Water comes up here at the same temperature all year, which in summer is a marvel and in winter is merely water. There is a cup on a chain.",
      artKey: "coldspring-well",
      sortOrder: 7,
      published: true,
      mapX: 62,
      mapY: 88,
    },
    {
      slug: "blackfell-scar",
      name: "Blackfell Scar",
      description:
        "A black seam in the fell where the rock has come apart, and steps cut down into it by somebody who stopped after four. People go in most mornings. Most of them come back out a good deal faster than they went in, and do not say much about why.",
      artKey: "blackfell-scar",
      sortOrder: 9,
      published: true,
      mapX: 28,
      mapY: 34,
      activities: [
        { type: "CAVE_DELVE", activityKey: "the-sunken-stair", displayOrder: 0 },
      ],
    },
  ],
} satisfies RegionContent;
