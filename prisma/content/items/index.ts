import { foodItems } from "./food";
import { toyItems } from "./toys";
import { curiosityItems } from "./curiosities";

export { itemCategories, itemTags } from "./categories";
export { foodItems, toyItems, curiosityItems };

export const allItems = [...foodItems, ...toyItems, ...curiosityItems];
