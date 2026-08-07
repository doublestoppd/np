import type { MealPoolContent } from "../schemas";

/**
 * The Warming Hut's free drink, one per player per game day.
 *
 * Mechanically the same as the community meal and deliberately so — it is
 * the same verb, at a different altitude, with a different set of things
 * in the pot. What makes it worth having as a second daily is that it
 * pays in `brewed` items, which is a palate taste the meal pool cannot
 * reach, so a companion particular about brewed things now has somewhere
 * free to be indulged.
 *
 * Weights are relative. The two uncommon drinks are deliberately thin
 * slices: a free hot drink should mostly be an ordinary hot drink.
 */
export const warmingHutPool = {
  slug: "warming-hut",
  entries: [
    { itemSlug: "pine-needle-tea", weight: 120 },
    { itemSlug: "barley-cordial", weight: 110 },
    { itemSlug: "hot-blackcurrant", weight: 100 },
    { itemSlug: "cloudberry-fizz", weight: 85 },
    { itemSlug: "juniper-warmer", weight: 30 },
    { itemSlug: "smoked-honey-toddy", weight: 18 },
  ],
} satisfies MealPoolContent;
