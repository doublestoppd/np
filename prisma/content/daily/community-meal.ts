import type { MealPoolContent } from "../schemas";

/**
 * The Hearth and Ladle daily meal pool. Entries must reference ACTIVE,
 * stackable, common FOOD items. The pool is synchronized with a recorded
 * configuration version: changing the entry set bumps the version, and
 * past claims keep the version they were served under.
 *
 * Each claim serves THREE portions, not one. This pool is the only source
 * of the request board's ingredients (deliberately — ADR-25 keeps them
 * un-buyable so a request cannot be arbitraged), which made one portion a
 * day a supply problem: requests ask for two or three of a specific dish,
 * so a single-portion claim meant waiting for the same dish to come up
 * twice. Three portions makes one lucky draw enough.
 */
export const communityMealPool = {
  slug: "hearth-and-ladle",
  entries: [
    { itemSlug: "honey-oat-biscuit", weight: 120, quantity: 3 },
    { itemSlug: "mushroom-hand-pie", weight: 100, quantity: 3 },
    { itemSlug: "berry-jam-toast", weight: 120, quantity: 3 },
    { itemSlug: "apple-clover-tart", weight: 100, quantity: 3 },
    { itemSlug: "warm-root-stew", weight: 80, quantity: 3 },
    { itemSlug: "cloudberry-muffin", weight: 100, quantity: 3 },
    { itemSlug: "herb-flecked-bread", weight: 120, quantity: 3 },
    { itemSlug: "roasted-mooncarrot", weight: 120, quantity: 3 },
    { itemSlug: "pear-and-thyme-scone", weight: 100, quantity: 3 },
    { itemSlug: "cinnamon-moss-cake", weight: 80, quantity: 3 },
  ],
} satisfies MealPoolContent;
