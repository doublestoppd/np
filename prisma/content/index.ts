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

export interface GameContent {
  species: readonly SpeciesContent[];
  categories: readonly ItemCategoryContent[];
  tags: readonly ItemTagContent[];
  items: readonly ItemContent[];
  regions: readonly RegionContent[];
  npcShops: readonly NpcShopContent[];
  upgradeTiers: readonly UpgradeTierContent[];
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
  daily: {
    wordAnswers,
    wheel: prizeWheel,
    meal: communityMealPool,
  },
};
