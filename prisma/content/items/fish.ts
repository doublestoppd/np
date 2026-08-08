import type { ItemContent } from "../schemas";

/**
 * What comes out of the tarns.
 *
 * Fish are FOOD, and that is not a shortcut — a companion eating what you
 * caught is the point of catching it, and it means fishing feeds the pet
 * loop instead of only the market. Every one carries the `freshwater`
 * tag, which is a palate taste, so a companion can turn out to be
 * particular about fish.
 *
 * Sizes are a property of the SPOT, not of the item (see
 * prisma/content/fishing/): the same char runs small in the lower tarn and
 * large in the upper, which is the only reason to walk the extra hour.
 */
export const fishItems = [
  {
    slug: "stone-loach",
    name: "Stone Loach",
    description:
      "A finger of a fish that spends its life under one particular rock and resents being introduced to daylight.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "foraged"],
    price: 10n,
    rarity: "COMMON",
    hungerRestore: 8,
    artKey: "stone-loach",
  },
  {
    slug: "silver-dace",
    name: "Silver Dace",
    description:
      "Quick, bright, and entirely uninterested in being caught, which it manages most of the time.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "foraged"],
    price: 16n,
    rarity: "COMMON",
    hungerRestore: 12,
    artKey: "silver-dace",
  },
  {
    slug: "speckled-char",
    name: "Speckled Char",
    description:
      "Cold-water fish with a scatter of pale spots, said to taste of the water it came out of. It does.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "preserved"],
    price: 26n,
    rarity: "COMMON",
    hungerRestore: 18,
    artKey: "speckled-char",
  },
  {
    slug: "moonscale-trout",
    name: "Moonscale Trout",
    description:
      "Pale enough to read by, or so the boathouse claims. Nobody has produced the book.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "sweet"],
    price: 55n,
    rarity: "UNCOMMON",
    hungerRestore: 28,
    artKey: "moonscale-trout",
  },
  {
    slug: "deepwater-char",
    name: "Deepwater Char",
    description:
      "The same fish as the speckled char, grown up in water nobody has found the bottom of. It shows.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "preserved"],
    price: 80n,
    rarity: "UNCOMMON",
    hungerRestore: 34,
    artKey: "deepwater-char",
  },
  {
    slug: "glass-perch",
    name: "Glass Perch",
    description:
      "Almost transparent, so its own dinner is visible from outside. Considered rude to mention.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "foraged"],
    price: 190n,
    rarity: "RARE",
    hungerRestore: 40,
    artKey: "glass-perch",
  },
  {
    slug: "old-grandfather-pike",
    name: "Old Grandfather Pike",
    description:
      "Every tarn has one and it is always the same one, which cannot be true and is repeated anyway.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "preserved"],
    price: 340n,
    rarity: "RARE",
    hungerRestore: 46,
    artKey: "old-grandfather-pike",
  },
  {
    slug: "tarn-ghost",
    name: "Tarn Ghost",
    description:
      "Colourless, cold to hold, and gone from the memory of anyone who lands one within a day or so. The boathouse keeps a tally regardless.",
    type: "FOOD",
    category: "food",
    tags: ["freshwater", "sweet"],
    price: 950n,
    rarity: "ULTRA_RARE",
    hungerRestore: 55,
    artKey: "tarn-ghost",
  },
] satisfies ItemContent[];
