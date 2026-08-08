import type { ItemContent } from "../schemas";

/**
 * Things a companion turns up with (ADR-61).
 *
 * Eight small objects, and the whole point of them is that they are worth
 * almost nothing. A companion that produced anything valuable would turn
 * affection into a faucet and the player into somebody checking on their
 * investment — so the most expensive thing on this list is a button.
 *
 * They are ordinary items in every other respect: tradeable, stackable,
 * displayable in a Hollow, and giveable on the shelf. What makes one worth
 * keeping is where it came from, and the game says that once, in the
 * sentence the companion's find is wrapped in — after that it is just an
 * object, and what it means is the player's business.
 */
export const keepsakeItems = [
  {
    slug: "one-good-feather",
    name: "One Good Feather",
    description:
      "Barred grey and white, and longer than it has any right to be. It was chosen. That much is obvious.",
    type: null,
    category: "curios",
    tags: ["foraged", "keepsake"],
    price: 3n,
    rarity: "COMMON",
    artKey: "one-good-feather",
  },
  {
    slug: "a-particular-pebble",
    name: "A Particular Pebble",
    description:
      "Grey, roundish, entirely unremarkable, and carried a considerable distance to reach you. There is no accounting for it.",
    type: null,
    category: "curios",
    tags: ["stone", "keepsake"],
    price: 2n,
    rarity: "COMMON",
    artKey: "a-particular-pebble",
  },
  {
    slug: "somebodys-button",
    name: "Somebody's Button",
    description:
      "Four holes, one chip, and a colour that was probably green. Not yours. Not anybody's you know.",
    type: null,
    category: "curios",
    tags: ["salvaged", "keepsake"],
    price: 5n,
    rarity: "COMMON",
    artKey: "somebodys-button",
  },
  {
    slug: "a-length-of-good-string",
    name: "A Length of Good String",
    description:
      "Eleven inches, knotted twice by somebody long ago, and defended vigorously all the way home.",
    type: null,
    category: "curios",
    tags: ["salvaged", "keepsake"],
    price: 2n,
    rarity: "COMMON",
    artKey: "a-length-of-good-string",
  },
  {
    slug: "the-smoothest-acorn",
    name: "The Smoothest Acorn",
    description:
      "Cup still on, shell unmarked, and not a scratch anywhere on it. Considerable restraint was involved.",
    type: null,
    category: "curios",
    tags: ["woodland", "keepsake"],
    price: 3n,
    rarity: "COMMON",
    artKey: "the-smoothest-acorn",
  },
  {
    slug: "a-scrap-of-blue",
    name: "A Scrap of Blue",
    description:
      "Torn cloth, sun-faded on one side only, from something that used to be somebody's favourite.",
    type: null,
    category: "curios",
    tags: ["salvaged", "keepsake"],
    price: 4n,
    rarity: "COMMON",
    artKey: "a-scrap-of-blue",
  },
  {
    slug: "an-interesting-snail-shell",
    name: "An Interesting Snail Shell",
    description:
      "Empty, thank goodness, and banded in a way the previous occupant presumably had opinions about.",
    type: null,
    category: "curios",
    tags: ["foraged", "keepsake"],
    price: 4n,
    rarity: "COMMON",
    artKey: "an-interesting-snail-shell",
  },
  {
    slug: "a-perfectly-flat-stone",
    name: "A Perfectly Flat Stone",
    description:
      "The kind you would skim, if you were the sort of person who could bring yourself to throw this one away.",
    type: null,
    category: "curios",
    tags: ["stone", "keepsake"],
    price: 6n,
    rarity: "COMMON",
    artKey: "a-perfectly-flat-stone",
  },
] as const satisfies readonly ItemContent[];
