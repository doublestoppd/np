import { foodItems } from "./food";
import { toyItems } from "./toys";
import { curiosityItems } from "./curiosities";
import { furnishingItems } from "./furnishings";

export { itemCategories, itemTags } from "./categories";
export { foodItems, toyItems, curiosityItems, furnishingItems };

export const allItems = [
  ...foodItems,
  ...toyItems,
  ...curiosityItems,
  ...furnishingItems,
];
