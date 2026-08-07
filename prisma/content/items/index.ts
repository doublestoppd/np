import { foodItems } from "./food";
import { toyItems } from "./toys";
import { curiosityItems } from "./curiosities";
import { furnishingItems } from "./furnishings";
import { scratchCardItems, scratchCards } from "./scratch-cards";

export { itemCategories, itemTags } from "./categories";
export { foodItems, toyItems, curiosityItems, furnishingItems };
export { scratchCardItems, scratchCards };

export const allItems = [
  ...foodItems,
  ...toyItems,
  ...curiosityItems,
  ...furnishingItems,
  ...scratchCardItems,
];
