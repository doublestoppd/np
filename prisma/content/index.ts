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
  FishingSpotContent,
  HollowAirContent,
  HollowGroundContent,
  HollowGroundPriceContent,
  RequestBoardContent,
  SpeciesContent,
  UpgradeTierContent,
  LanternCluesContent,
  ScratchCardContent,
  WheelContent,
  WordAnswersContent,
} from "./schemas";
import { starterSpecies } from "./species";
import { allItems, itemCategories, itemTags, scratchCards } from "./items";
import { regions } from "./world";
import { npcShops, playerShopUpgradeTiers } from "./shops";
import {
  communityMealPool,
  lanternClues,
  prizeWheel,
  warmingHutPool,
  wordAnswers,
} from "./daily";
import { requestBoards } from "./requests";
import { forageSpots } from "./foraging";
import { fishingSpots } from "./fishing";
import { hollowAirs, hollowGrounds, hollowGroundPrices } from "./hollow";

export interface GameContent {
  species: readonly SpeciesContent[];
  categories: readonly ItemCategoryContent[];
  tags: readonly ItemTagContent[];
  items: readonly ItemContent[];
  scratchCards: readonly ScratchCardContent[];
  regions: readonly RegionContent[];
  npcShops: readonly NpcShopContent[];
  upgradeTiers: readonly UpgradeTierContent[];
  requestBoards: readonly RequestBoardContent[];
  forageSpots: readonly ForageSpotContent[];
  fishingSpots: readonly FishingSpotContent[];
  hollow: {
    grounds: readonly HollowGroundContent[];
    groundPrices: readonly HollowGroundPriceContent[];
    airs: readonly HollowAirContent[];
  };
  daily: {
    wordAnswers: WordAnswersContent;
    wheel: WheelContent;
    meal: MealPoolContent;
    drinks: MealPoolContent;
    lanternClues: LanternCluesContent;
  };
}

export const gameContent: GameContent = {
  species: starterSpecies,
  categories: itemCategories,
  tags: itemTags,
  items: allItems,
  scratchCards,
  regions,
  npcShops,
  upgradeTiers: playerShopUpgradeTiers,
  requestBoards,
  forageSpots,
  fishingSpots,
  hollow: {
    grounds: hollowGrounds,
    groundPrices: hollowGroundPrices,
    airs: hollowAirs,
  },
  daily: {
    wordAnswers,
    wheel: prizeWheel,
    meal: communityMealPool,
    drinks: warmingHutPool,
    lanternClues,
  },
};
