import type { MealPoolContent } from "../schemas";

/**
 * The Hearth and Ladle daily meal pool. Entries must reference ACTIVE,
 * stackable, common FOOD items. The pool is synchronized with a recorded
 * configuration version: changing the entry set bumps the version, and
 * past claims keep the version they were served under.
 */
export const communityMealPool = {
  slug: "hearth-and-ladle",
  entries: [
    { itemSlug: "honey-oat-biscuit", weight: 120 },
    { itemSlug: "mushroom-hand-pie", weight: 100 },
    { itemSlug: "berry-jam-toast", weight: 120 },
    { itemSlug: "apple-clover-tart", weight: 100 },
    { itemSlug: "warm-root-stew", weight: 80 },
    { itemSlug: "cloudberry-muffin", weight: 100 },
    { itemSlug: "herb-flecked-bread", weight: 120 },
    { itemSlug: "roasted-mooncarrot", weight: 120 },
    { itemSlug: "pear-and-thyme-scone", weight: 100 },
    { itemSlug: "cinnamon-moss-cake", weight: 80 },
  ],
} satisfies MealPoolContent;
