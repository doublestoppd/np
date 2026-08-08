import { foodItems } from "./food";
import { toyItems } from "./toys";
import { curiosityItems } from "./curiosities";
import { furnishingItems } from "./furnishings";
import { scratchCardItems, scratchCards } from "./scratch-cards";
import { fishItems } from "./fish";
import { drinkItems } from "./drinks";
import { relicItems } from "./relics";
import { spinTokenItems, spinTokens } from "./tokens";
import { bookItems, books } from "./books";
import { caveHoard, caveHoardBooks, caveHoardItems } from "./cave-hoard";
import { careItems, remedies } from "./care";
import { keepsakeItems } from "./keepsakes";

export { itemCategories, itemTags } from "./categories";
export { foodItems, toyItems, curiosityItems, furnishingItems };
export { scratchCardItems, scratchCards };
export { fishItems, drinkItems };
export { relicItems };
export { spinTokenItems, spinTokens };
export { bookItems, books };
export { caveHoard, caveHoardBooks, caveHoardItems };
export { careItems, remedies };
export { keepsakeItems };

export const allItems = [
  ...foodItems,
  ...toyItems,
  ...curiosityItems,
  ...furnishingItems,
  ...scratchCardItems,
  ...fishItems,
  ...drinkItems,
  ...relicItems,
  ...spinTokenItems,
  ...bookItems,
  ...caveHoardItems,
  ...careItems,
  ...keepsakeItems,
];
