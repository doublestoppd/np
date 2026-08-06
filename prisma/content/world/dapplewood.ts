import type { RegionContent } from "../schemas";

/**
 * Placeholder world content — names and copy are deliberately provisional
 * and safe to replace before the final world identity is decided
 * (docs/design-philosophy.md). Daily-activity locations are referenced by
 * slug from src/server/modules/daily/locations.ts.
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
    },
    {
      slug: "the-mossy-market",
      name: "The Mossy Market",
      description:
        "A hollow log fitted with shelves, a counter, and opinions about correct change.",
      artKey: "the-mossy-market",
      sortOrder: 3,
      published: true,
      mapX: 72,
      mapY: 28,
    },
    {
      slug: "the-listening-stump",
      name: "The Listening Stump",
      description:
        "An enormous old stump. It is said to listen. It has never once been heard to reply.",
      artKey: "the-listening-stump",
      sortOrder: 4,
      published: false,
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
    },
  ],
} satisfies RegionContent;
