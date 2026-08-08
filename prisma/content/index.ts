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
  ForumBoardContent,
  SpeciesContent,
  UpgradeTierContent,
  LanternCluesContent,
  ScratchCardContent,
  SpinTokenContent,
  BookContent,
  AilmentKindContent,
  KeepsakeContent,
  CaveHoardEntryContent,
  CaveSectionContent,
  RemedyContent,
  WheelContent,
  WordAnswersContent,
} from "./schemas";
import { starterSpecies } from "./species";
import {
  allItems,
  books,
  caveHoard,
  caveHoardBooks,
  itemCategories,
  itemTags,
  remedies,
  scratchCards,
  spinTokens,
} from "./items";
import { caveSections } from "./cave";
import { ailmentKinds } from "./pets/ailments";
import { keepsakes } from "./pets/keepsakes";
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
import { forumBoards } from "./forums";
import { forageSpots } from "./foraging";
import { fishingSpots } from "./fishing";
import { hollowAirs, hollowGrounds, hollowGroundPrices } from "./hollow";

export interface GameContent {
  species: readonly SpeciesContent[];
  categories: readonly ItemCategoryContent[];
  tags: readonly ItemTagContent[];
  items: readonly ItemContent[];
  scratchCards: readonly ScratchCardContent[];
  spinTokens: readonly SpinTokenContent[];
  books: readonly BookContent[];
  cave: {
    sections: readonly CaveSectionContent[];
    hoard: readonly CaveHoardEntryContent[];
  };
  pets: {
    ailments: readonly AilmentKindContent[];
    remedies: readonly RemedyContent[];
    keepsakes: readonly KeepsakeContent[];
  };
  regions: readonly RegionContent[];
  npcShops: readonly NpcShopContent[];
  upgradeTiers: readonly UpgradeTierContent[];
  requestBoards: readonly RequestBoardContent[];
  forumBoards: readonly ForumBoardContent[];
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
  spinTokens,
  books: [...books, ...caveHoardBooks],
  cave: { sections: caveSections, hoard: caveHoard },
  pets: { ailments: ailmentKinds, remedies, keepsakes },
  regions,
  npcShops,
  upgradeTiers: playerShopUpgradeTiers,
  requestBoards,
  forumBoards,
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
