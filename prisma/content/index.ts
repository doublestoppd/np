/**
 * Aggregated game content (plain data only — no Prisma, no side effects).
 * Validation lives in prisma/seed/validation.ts; database synchronization
 * in prisma/seed/. See prisma/content/README.md for authoring.
 */
import type {
  ItemCategoryContent,
  ItemContent,
  ItemTagContent,
  MealPoolContent,
  NpcShopContent,
  RegionContent,
  ForageSpotContent,
  RequestBoardContent,
  SpeciesContent,
  UpgradeTierContent,
  WheelContent,
  WordAnswersContent,
} from "./schemas";
import { starterSpecies } from "./species";
import { allItems, itemCategories, itemTags } from "./items";
import { regions } from "./world";
import { npcShops, playerShopUpgradeTiers } from "./shops";
import { communityMealPool, prizeWheel, wordAnswers } from "./daily";
import { requestBoards } from "./requests";
import { forageSpots } from "./foraging";

export interface GameContent {
  species: readonly SpeciesContent[];
  categories: readonly ItemCategoryContent[];
  tags: readonly ItemTagContent[];
  items: readonly ItemContent[];
  regions: readonly RegionContent[];
  npcShops: readonly NpcShopContent[];
  upgradeTiers: readonly UpgradeTierContent[];
  requestBoards: readonly RequestBoardContent[];
  forageSpots: readonly ForageSpotContent[];
  daily: {
    wordAnswers: WordAnswersContent;
    wheel: WheelContent;
    meal: MealPoolContent;
  };
}

export const gameContent: GameContent = {
  species: starterSpecies,
  categories: itemCategories,
  tags: itemTags,
  items: allItems,
  regions,
  npcShops,
  upgradeTiers: playerShopUpgradeTiers,
  requestBoards,
  forageSpots,
  daily: {
    wordAnswers,
    wheel: prizeWheel,
    meal: communityMealPool,
  },
};
