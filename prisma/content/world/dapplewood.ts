import type { RegionContent } from "../schemas";

/**
 * Placeholder world content — names and copy are deliberately provisional
 * and safe to replace before the final world identity is decided
 * (docs/design-philosophy.md).
 *
 * Each location declares the activities available there, in display
 * order. An attachment names a type and a stable activityKey; the
 * configuration itself lives in the owning domain's content file
 * (prisma/content/shops, prisma/content/daily, prisma/content/requests).
 */
export const dapplewood = {
  slug: "dapplewood",
  name: "Dapplewood",
  description:
    "A wood of shifting light and unhurried paths. Nothing here is in a rush, including the residents.",
  artKey: "dapplewood",
  sortOrder: 0,
  published: true,
  locations: [
    {
      slug: "mosslight-clearing",
      name: "Mosslight Clearing",
      description:
        "A round green clearing where the moss glows faintly after rain. Popular with pets, picnickers, and one extremely territorial squirrel.",
      artKey: "mosslight-clearing",
      sortOrder: 0,
      published: true,
      mapX: 30,
      mapY: 38,
      activities: [
        {
          type: "FORAGING",
          activityKey: "mosslight-undergrowth",
          displayOrder: 0,
        },
      ],
    },
    {
      slug: "old-footbridge",
      name: "The Old Footbridge",
      description:
        "A stone bridge over slow water. Leaning on the rail and watching the river is considered a complete activity here.",
      artKey: "old-footbridge",
      sortOrder: 1,
      published: true,
      mapX: 64,
      mapY: 56,
      activities: [
        {
          type: "FORAGING",
          activityKey: "footbridge-shallows",
          displayOrder: 0,
        },
      ],
    },
    {
      slug: "toadstool-hollow",
      name: "Toadstool Hollow",
      description:
        "A dim, cosy dell crowded with mushrooms of respectable size and questionable opinions.",
      artKey: "toadstool-hollow",
      sortOrder: 2,
      published: true,
      mapX: 44,
      mapY: 74,
      activities: [
        {
          type: "NPC_SHOP",
          activityKey: "fernlight-apothecary",
          displayOrder: 10,
          active: true,
        },
      ],
    },
    {
      slug: "beechrow-physic-garden",
      name: "Beechrow Physic Garden",
      description:
        "Beds of unglamorous plants in straight rows, each with a small label somebody has rewritten more than once. A bench, a shed, and a strong smell of bruised leaves.",
      artKey: "beechrow-physic-garden",
      sortOrder: 4,
      published: true,
      mapX: 18,
      mapY: 58,
      activities: [
        {
          type: "NPC_SHOP",
          activityKey: "the-physic-shed",
          displayOrder: 0,
          active: true,
        },
      ],
    },
    {
      slug: "tanglestile-green",
      name: "Tanglestile Green",
      description:
        "A patch of trodden grass where four paths give up arguing and meet. The fallen log along one side has been fitted out with shelves and a counter, and the stile at the far end has been climbed by so many people that it now leans.",
      artKey: "tanglestile-green",
      sortOrder: 3,
      published: true,
      mapX: 72,
      mapY: 28,
      activities: [
        {
          type: "NPC_SHOP",
          activityKey: "mossy-market",
          displayOrder: 10,
          active: true,
        },
        // Deliberately the same room as the paid shelves. A free table on
        // its own is a curiosity; a free table three feet from a counter
        // with opinions about correct change is a joke that lands, and it
        // is the only place in the game where the answer to "what does
        // this cost" is nothing at all.
        {
          type: "GIVEAWAY",
          activityKey: "mossy-market-leaving-shelf",
          displayOrder: 20,
          active: true,
        },
      ],
    },
    {
      // Named for the tree, not for the game in it — a location whose name
      // matches its activity renders the same heading twice (ADR-59).
      slug: "the-hundred-steps",
      name: "The Hundred Steps",
      description:
        "A beech so old the canopy has its own weather. Somebody has been nailing footholds up the trunk for generations, and nobody has ever admitted to starting it.",
      artKey: "the-hundred-steps",
      sortOrder: 8,
      published: true,
      mapX: 18,
      mapY: 66,
      activities: [
        { type: "TREE_CLIMB", activityKey: "the-long-way-up", displayOrder: 0 },
      ],
    },
    {
      slug: "the-listening-stump",
      name: "The Listening Stump",
      description:
        "An enormous old stump. It is said to listen. It has never once been heard to reply.",
      artKey: "the-listening-stump",
      sortOrder: 4,
      // A location may host nothing at all — the world model calls that a
      // flavour page and means it. Foraging took Dapplewood's other two
      // empty locations, and a world where every page has a button is a
      // menu rather than a place.
      published: true,
      mapX: 18,
      mapY: 82,
    },
    {
      slug: "whisperleaf-reading-room",
      name: "Whisperleaf Reading Room",
      description:
        "The librarian has hidden today's words in plain sight. This is considered educational.",
      artKey: "whisperleaf-reading-room",
      sortOrder: 5,
      published: true,
      mapX: 14,
      mapY: 24,
      activities: [
        {
          type: "DAILY_WORD",
          activityKey: "daily-word-main",
          displayOrder: 10,
          active: true,
        },
      ],
    },
    {
      slug: "the-quiet-bindery",
      name: "The Quiet Bindery",
      description:
        "Presses, thread, and a smell of glue and paper dust. Books are sewn at the back and sold at the front, and the binder would rather you read them aloud to somebody.",
      artKey: "the-quiet-bindery",
      sortOrder: 8,
      published: true,
      mapX: 26,
      mapY: 76,
      activities: [
        { type: "NPC_SHOP", activityKey: "quiet-bindery", displayOrder: 0 },
      ],
    },
    {
      slug: "brassbell-pavilion",
      name: "Brassbell Pavilion",
      description:
        "The wheel has been inspected for fairness by someone who owns the wheel.",
      artKey: "brassbell-pavilion",
      sortOrder: 6,
      published: true,
      mapX: 52,
      mapY: 16,
      activities: [
        {
          type: "DAILY_WHEEL",
          activityKey: "brassbell-wheel",
          displayOrder: 10,
          active: true,
        },
      ],
    },
    {
      slug: "hearth-and-ladle",
      name: "Hearth and Ladle",
      description:
        "One complimentary meal per visitor. Seconds remain a philosophical question.",
      artKey: "hearth-and-ladle",
      sortOrder: 7,
      published: true,
      mapX: 84,
      mapY: 66,
      activities: [
        {
          type: "DAILY_MEAL",
          activityKey: "hearth-and-ladle",
          displayOrder: 10,
          active: true,
        },
        {
          type: "REQUEST_BOARD",
          activityKey: "hearth-kitchen-requests",
          displayOrder: 20,
          active: true,
        },
      ],
    },
  ],
} satisfies RegionContent;
