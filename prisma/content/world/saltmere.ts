import type { RegionContent } from "../schemas";

/**
 * Placeholder world content — names and copy are deliberately provisional
 * and safe to replace before the final world identity is decided
 * (docs/design-philosophy.md).
 *
 * Saltmere is Dapplewood's opposite in texture. Dapplewood is a place you
 * stay in: green, warm, unhurried, everything grown or baked nearby.
 * Saltmere is a place you look through — flat grey mud and salt, cold
 * light, and an economy built entirely on things that arrived from
 * somewhere else and got left. Dapplewood's verb is "linger". Saltmere's
 * is "pick through it".
 *
 * The tide runs through the copy and is presentation only. There is no
 * schedule, window, or missable content anywhere in this region, and none
 * should be added — the water is always described as something that has
 * already happened.
 */
export const saltmere = {
  slug: "saltmere",
  name: "Saltmere",
  description:
    "A flat grey country of salt, mud, and water that comes and goes on its own business. Everything here has been somewhere else first.",
  artKey: "saltmere",
  sortOrder: 1,
  published: true,
  locations: [
    {
      slug: "lowwater-landing",
      name: "Lowwater Landing",
      description:
        "A slipway of green stone where the boats sit on mud for half of every day. Nobody treats this as a problem; the mud is considered a legitimate mooring.",
      artKey: "lowwater-landing",
      sortOrder: 0,
      published: true,
      mapX: 22,
      mapY: 58,
      activities: [
        { type: "FORAGING", activityKey: "slipway-mud", displayOrder: 0 },
      ],
    },
    {
      slug: "the-wrackline",
      name: "The Wrackline",
      description:
        "The line the water leaves behind when it goes: rope, tin, glass, and one boot. The boot has been here longer than anyone keeping records and is now given out as a direction.",
      artKey: "the-wrackline",
      sortOrder: 1,
      published: true,
      mapX: 48,
      mapY: 76,
      activities: [
        { type: "FORAGING", activityKey: "wrackline-strand", displayOrder: 0 },
      ],
    },
    {
      slug: "the-drying-sheds",
      name: "The Drying Sheds",
      description:
        "Long white sheds where the salt is raked into ridges and left to dry. Visitors are asked not to walk on the ridges. The ridges are not fragile; the raker is.",
      artKey: "the-drying-sheds",
      sortOrder: 2,
      published: true,
      mapX: 32,
      mapY: 28,
      activities: [
        {
          type: "NPC_SHOP",
          activityKey: "raker-chit-table",
          displayOrder: 10,
          active: true,
        },
      ],
    },
    {
      slug: "the-tumblehouse",
      name: "The Tumblehouse",
      description:
        "A shed with a brass contraption in it, three drums tall, worked by a lever that takes two hands. The counter beside it sells the tokens and takes no coins for anything else.",
      artKey: "the-tumblehouse",
      sortOrder: 8,
      published: true,
      mapX: 46,
      mapY: 58,
      activities: [
        { type: "SLOT_MACHINE", activityKey: "tumblehouse-drums", displayOrder: 0 },
        { type: "NPC_SHOP", activityKey: "tumblehouse-counter", displayOrder: 1 },
      ],
    },
    {
      slug: "the-salt-larder",
      name: "The Salt Larder",
      description:
        "A dry store built high and shuttered tight, stocked entirely with food that has no interest in spoiling. Nothing in here needs eating today.",
      artKey: "the-salt-larder",
      sortOrder: 3,
      published: true,
      mapX: 74,
      mapY: 22,
      activities: [
        { type: "NPC_SHOP", activityKey: "salt-larder", displayOrder: 0 },
      ],
    },
    {
      slug: "the-found-counter",
      name: "The Found Counter",
      description:
        "A long counter of recovered things, each with a paper tag saying where it turned up. Some of the tags are older than the counter.",
      artKey: "the-found-counter",
      sortOrder: 4,
      published: true,
      mapX: 66,
      mapY: 44,
      activities: [
        { type: "NPC_SHOP", activityKey: "found-counter", displayOrder: 0 },
        {
          type: "REQUEST_BOARD",
          activityKey: "found-counter-claims",
          displayOrder: 1,
        },
      ],
    },
    {
      slug: "the-mending-yard",
      name: "The Mending Yard",
      description:
        "Nets, hulls, handles and hinges, all in the middle of being fixed. One chair here has been repaired more times than it has been sat in, and nobody will admit to owning it.",
      artKey: "the-mending-yard",
      sortOrder: 5,
      published: true,
      mapX: 42,
      mapY: 50,
      activities: [
        {
          type: "SORTING_BENCH",
          activityKey: "saltmere-sorting-bench",
          displayOrder: 0,
        },
      ],
    },
    {
      slug: "the-quiet-beacon",
      name: "The Quiet Beacon",
      description:
        "A lamp tower still lit for boats that stopped coming. No one has proposed turning it off and no one has explained why not. The stairs are open.",
      artKey: "the-quiet-beacon",
      sortOrder: 6,
      published: true,
      mapX: 88,
      mapY: 68,
      activities: [
        // The notice only. Looking happens at every location in the world,
        // from the page shell rather than from an attachment — a lamp
        // tower with no lamp in it is the right place to be told where the
        // lamp has got to, and the wrong place to search.
        {
          type: "LANTERN_HUNT",
          activityKey: "wandering-lantern",
          displayOrder: 10,
          active: true,
        },
      ],
    },
    {
      slug: "the-deepwater-steps",
      name: "The Deepwater Steps",
      description:
        "Stone steps that go down into the water and do not stop. The water has never gone out far enough to settle how many there are.",
      artKey: "the-deepwater-steps",
      sortOrder: 7,
      // Staged: the copy promises something the region does not yet have a
      // verb for. It publishes when there is a reason to walk down them.
      published: false,
      mapX: 58,
      mapY: 92,
    },
  ],
} satisfies RegionContent;
