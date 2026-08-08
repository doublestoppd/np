import type { ItemContent } from "../schemas";

/**
 * What the Warming Hut has on the stove.
 *
 * Drinks are FOOD with modest hunger values and the `brewed` palate
 * taste. They are deliberately cheap: the whole point of the hut is that
 * one is free every day and nobody is counting, so a drink worth 200
 * coins would turn a kindness into a queue.
 *
 * `brewed` is a taste a companion can be particular about, which is why
 * there are six of these rather than three — a taste with one member is
 * not a preference, it is a hint.
 */
export const drinkItems = [
  {
    slug: "pine-needle-tea",
    name: "Pine Needle Tea",
    description:
      "Tastes of the walk up. Improves considerably if you have just done the walk up.",
    type: "FOOD",
    category: "food",
    tags: ["brewed", "woodland"],
    price: 9n,
    rarity: "COMMON",
    hungerRestore: 6,
    artKey: "pine-needle-tea",
  },
  {
    slug: "barley-cordial",
    name: "Barley Cordial",
    description:
      "Thick, sweet, and faintly medicinal. The hut makes it in a quantity that suggests confidence.",
    type: "FOOD",
    category: "food",
    tags: ["brewed", "sweet"],
    price: 12n,
    rarity: "COMMON",
    hungerRestore: 9,
    artKey: "barley-cordial",
  },
  {
    slug: "hot-blackcurrant",
    name: "Hot Blackcurrant",
    description:
      "Dark, sharp, and hot enough to be a decision. Universally agreed to be worth it.",
    type: "FOOD",
    category: "food",
    tags: ["brewed", "sweet"],
    price: 14n,
    rarity: "COMMON",
    hungerRestore: 10,
    artKey: "hot-blackcurrant",
  },
  {
    slug: "cloudberry-fizz",
    name: "Cloudberry Fizz",
    description:
      "Somebody carried the bottles up here, and everybody drinking one is briefly aware of that.",
    type: "FOOD",
    category: "food",
    tags: ["brewed", "foraged"],
    price: 17n,
    rarity: "COMMON",
    hungerRestore: 11,
    artKey: "cloudberry-fizz",
  },
  {
    slug: "juniper-warmer",
    name: "Juniper Warmer",
    description:
      "Steeped long enough that the smell reaches the door. The stonesetter can tell when a batch is on from two fields away.",
    type: "FOOD",
    category: "food",
    tags: ["brewed", "woodland"],
    price: 34n,
    rarity: "UNCOMMON",
    hungerRestore: 16,
    artKey: "juniper-warmer",
  },
  {
    slug: "smoked-honey-toddy",
    name: "Smoked Honey Toddy",
    description:
      "Honey, smoke, and something the hut will not name. Reserved for weather that has earned it.",
    type: "FOOD",
    category: "food",
    tags: ["brewed", "sweet"],
    price: 42n,
    rarity: "UNCOMMON",
    hungerRestore: 20,
    artKey: "smoked-honey-toddy",
  },
] satisfies ItemContent[];
