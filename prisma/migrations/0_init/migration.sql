-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('FOOD', 'TOY', 'SCRATCH_CARD', 'SPIN_TOKEN', 'BOOK', 'REMEDY', 'GROOMING_TOOL');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'ULTRA_RARE');

-- CreateEnum
CREATE TYPE "ItemLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProvenancePolicy" AS ENUM ('NONE', 'ORIGINAL_SOURCE', 'FULL_HISTORY');

-- CreateEnum
CREATE TYPE "FurnishingSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'CENTREPIECE');

-- CreateEnum
CREATE TYPE "ScratchPrizeKind" AS ENUM ('COINS', 'ITEM', 'NOTHING', 'JACKPOT');

-- CreateEnum
CREATE TYPE "SlotPrizeKind" AS ENUM ('COINS', 'ITEM', 'NOTHING');

-- CreateEnum
CREATE TYPE "ItemInstanceStatus" AS ENUM ('OWNED', 'ESCROWED');

-- CreateEnum
CREATE TYPE "LocationActivityType" AS ENUM ('NPC_SHOP', 'DAILY_WORD', 'DAILY_WHEEL', 'DAILY_MEAL', 'REQUEST_BOARD', 'FORAGING', 'SORTING_BENCH', 'GIVEAWAY', 'LANTERN_HUNT', 'FISHING', 'DAILY_DRINK', 'MATCHING_GAME', 'SLOT_MACHINE', 'SUDOKU', 'CAVE_DELVE', 'PAPER_BIRD', 'TREE_CLIMB', 'SNAKE', 'FORTUNE_ENGINE');

-- CreateEnum
CREATE TYPE "MatchingDifficulty" AS ENUM ('GENTLE', 'BRISK', 'DEEP');

-- CreateEnum
CREATE TYPE "MatchingRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'VOID');

-- CreateEnum
CREATE TYPE "ArcadeGame" AS ENUM ('PAPER_BIRD', 'TREE_CLIMB', 'SNAKE');

-- CreateEnum
CREATE TYPE "ArcadeRunStatus" AS ENUM ('IN_PROGRESS', 'FINISHED', 'VOID');

-- CreateEnum
CREATE TYPE "SudokuAttemptStatus" AS ENUM ('IN_PROGRESS', 'SOLVED');

-- CreateEnum
CREATE TYPE "SortingRunStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'STUCK', 'ABANDONED', 'VOID');

-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NpcStockStatus" AS ENUM ('ACTIVE', 'SOLD_OUT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlayerListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('STARTER_GRANT', 'ITEM_USE', 'NPC_PURCHASE', 'PLAYER_LISTING_CREATE', 'PLAYER_LISTING_REPRICE', 'PLAYER_LISTING_CANCEL', 'PLAYER_SALE', 'PLAYER_PURCHASE', 'PROCEEDS_CLAIM', 'CAPACITY_UPGRADE', 'ADMIN_ADJUST', 'DAILY_WORD_REWARD', 'DAILY_WHEEL_PRIZE', 'DAILY_FOOD_CLAIM', 'REQUEST_REWARD', 'FORAGE_FIND', 'SORTING_REWARD', 'RANDOM_EVENT', 'FURNISHING_PURCHASE', 'HOLLOW_GROUND', 'HOLLOW_AIR', 'GIVEAWAY_LEAVE', 'GIVEAWAY_TAKE', 'LANTERN_FOUND', 'SCRATCH_PRIZE', 'MATCHING_REWARD', 'SLOT_PRIZE', 'SUDOKU_REWARD', 'CAVE_FIND', 'ARCADE_CLAIM', 'FORTUNE_STAKE', 'FORTUNE_PRIZE');

-- CreateEnum
CREATE TYPE "WordDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "DailyWordStatus" AS ENUM ('IN_PROGRESS', 'SOLVED', 'FAILED');

-- CreateEnum
CREATE TYPE "LanternSearchStatus" AS ENUM ('SEARCHING', 'FOUND', 'OUT_OF_LOOKS');

-- CreateEnum
CREATE TYPE "WheelResultType" AS ENUM ('COINS', 'ITEM_POOL', 'NOTHING');

-- CreateEnum
CREATE TYPE "ForumVisibility" AS ENUM ('VISIBLE', 'WITHDRAWN', 'REMOVED');

-- CreateEnum
CREATE TYPE "ForumReportStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ModerationActionType" AS ENUM ('POST_REMOVED', 'POST_RESTORED', 'THREAD_REMOVED', 'THREAD_RESTORED', 'THREAD_LOCKED', 'THREAD_UNLOCKED', 'THREAD_PINNED', 'THREAD_UNPINNED', 'REPORT_DISMISSED');

-- CreateEnum
CREATE TYPE "CaveDelveStatus" AS ENUM ('IN_PROGRESS', 'CLEARED', 'TURNED_BACK');

-- CreateEnum
CREATE TYPE "ShrineTheme" AS ENUM ('MIDNIGHT_WEB', 'BUBBLEGUM', 'LAGOON', 'MARIGOLD', 'VAPOUR', 'PARCHMENT', 'TERMINAL', 'COTTON_CANDY');

-- CreateEnum
CREATE TYPE "ShrineEffect" AS ENUM ('NONE', 'SPARKLES', 'SNOW', 'LEAVES', 'BUBBLES', 'EMBERS');

-- CreateEnum
CREATE TYPE "ShrineTune" AS ENUM ('NONE', 'MOSSY_WALTZ', 'BRASS_MARCH', 'LANTERN_LULLABY', 'DEEP_DIRGE', 'MARKET_JIG', 'STARLIGHT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "normalizedUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "coins" BIGINT NOT NULL DEFAULT 200,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "commerceDisabledAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarterClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarterClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "featuredPetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowcaseEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemInstanceId" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowcaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HollowGroundDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HollowGroundDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HollowAnchorDefinition" (
    "id" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxSize" "FurnishingSize" NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "HollowAnchorDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HollowGroundPrice" (
    "heldCount" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,

    CONSTRAINT "HollowGroundPrice_pkey" PRIMARY KEY ("heldCount")
);

-- CreateTable
CREATE TABLE "HollowAirDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HollowAirDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HollowScene" (
    "id" TEXT NOT NULL,
    "hollowId" TEXT NOT NULL,
    "groundId" TEXT NOT NULL,
    "airId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HollowScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HollowPlacement" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "anchorKey" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "plantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HollowPlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HollowAirGrant" (
    "id" TEXT NOT NULL,
    "hollowId" TEXT NOT NULL,
    "airId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HollowAirGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetSpecies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artKey" TEXT NOT NULL,

    CONSTRAINT "PetSpecies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "hunger" INTEGER NOT NULL DEFAULT 80,
    "happiness" INTEGER NOT NULL DEFAULT 80,
    "energy" INTEGER NOT NULL DEFAULT 80,
    "health" INTEGER NOT NULL DEFAULT 100,
    "coat" INTEGER NOT NULL DEFAULT 80,
    "statsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "insight" INTEGER NOT NULL DEFAULT 0,
    "bond" INTEGER NOT NULL DEFAULT 0,
    "lastSatWithAt" TIMESTAMP(3),
    "palateSeed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetBookReading" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "firstReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timesRead" INTEGER NOT NULL DEFAULT 1,
    "insightGiven" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PetBookReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetDelight" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PetDelight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetToyUse" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetToyUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemTag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ItemTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ItemType",
    "artKey" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "rarity" "Rarity" NOT NULL DEFAULT 'COMMON',
    "tradeable" BOOLEAN NOT NULL DEFAULT true,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "provenancePolicy" "ProvenancePolicy" NOT NULL DEFAULT 'NONE',
    "lifecycle" "ItemLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "hungerRestore" INTEGER,
    "happinessBoost" INTEGER,
    "coatCare" INTEGER,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScratchCard" (
    "itemId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "jackpotBps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScratchCard_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "ScratchPrize" (
    "id" TEXT NOT NULL,
    "cardItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ScratchPrizeKind" NOT NULL,
    "weight" INTEGER NOT NULL,
    "coinAmount" BIGINT,
    "prizeItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScratchPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScratchResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "awardedCoins" BIGINT NOT NULL DEFAULT 0,
    "awardedItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reveal" TEXT NOT NULL DEFAULT '',
    "won" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScratchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScratchJackpot" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pool" BIGINT NOT NULL DEFAULT 0,
    "minimum" BIGINT NOT NULL,
    "lastWonAt" TIMESTAMP(3),
    "lastWonBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScratchJackpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpinToken" (
    "itemId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "faces" INTEGER NOT NULL DEFAULT 6,

    CONSTRAINT "SpinToken_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "SlotPrize" (
    "id" TEXT NOT NULL,
    "tokenItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "SlotPrizeKind" NOT NULL,
    "weight" INTEGER NOT NULL,
    "coinAmount" BIGINT,
    "prizeItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "faceIndex" INTEGER,
    "displayOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SlotPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotSpin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "awardedCoins" BIGINT NOT NULL DEFAULT 0,
    "awardedItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reels" TEXT NOT NULL DEFAULT '',
    "won" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "itemId" TEXT NOT NULL,
    "insight" INTEGER NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Book_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "Furnishing" (
    "itemId" TEXT NOT NULL,
    "size" "FurnishingSize" NOT NULL,
    "growthDays" INTEGER,

    CONSTRAINT "Furnishing_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "InventoryEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemInstance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "ItemInstanceStatus" NOT NULL DEFAULT 'OWNED',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquisitionSource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemProvenanceEvent" (
    "id" TEXT NOT NULL,
    "itemInstanceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "sourceType" TEXT NOT NULL,
    "transactionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemProvenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "mapX" INTEGER,
    "mapY" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationActivity" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "type" "LocationActivityType" NOT NULL,
    "activityKey" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForageSpot" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 3,
    "nothingWeight" INTEGER NOT NULL DEFAULT 0,
    "nothingFlavor" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForageSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForageSpotEntry" (
    "id" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectionWeight" INTEGER NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ForageSpotEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForageFind" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "searchOrdinal" INTEGER NOT NULL,
    "itemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForageFind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FishingSpot" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 6,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "emptyWeight" INTEGER NOT NULL DEFAULT 0,
    "emptyFlavor" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FishingSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FishingSpotEntry" (
    "id" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectionWeight" INTEGER NOT NULL,
    "minLength" INTEGER NOT NULL,
    "maxLength" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FishingSpotEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FishCatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "castOrdinal" INTEGER NOT NULL,
    "itemId" TEXT,
    "lengthCm" INTEGER NOT NULL DEFAULT 0,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FishCatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FishRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lengthCm" INTEGER NOT NULL,
    "caughtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FishRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcadeRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" "ArcadeGame" NOT NULL,
    "gameDate" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "status" "ArcadeRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "trace" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "ticks" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "forfeitedAt" TIMESTAMP(3),

    CONSTRAINT "ArcadeRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcadePayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "game" "ArcadeGame" NOT NULL,
    "claimIndex" INTEGER NOT NULL,
    "runId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "coins" BIGINT NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArcadePayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "difficulty" "MatchingDifficulty" NOT NULL,
    "seed" TEXT NOT NULL,
    "status" "MatchingRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "flips" TEXT NOT NULL DEFAULT '',
    "pairsFound" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "MatchingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingPayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "difficulty" "MatchingDifficulty" NOT NULL,
    "runId" TEXT NOT NULL,
    "coins" BIGINT NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchingPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SudokuPuzzle" (
    "id" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "band" INTEGER NOT NULL,
    "givens" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SudokuPuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SudokuAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "band" INTEGER NOT NULL,
    "entries" TEXT NOT NULL,
    "status" "SudokuAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "wrongChecks" INTEGER NOT NULL DEFAULT 0,
    "solveSeconds" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solvedAt" TIMESTAMP(3),
    "coins" BIGINT NOT NULL DEFAULT 0,
    "transactionId" TEXT,

    CONSTRAINT "SudokuAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SortingRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "deckVersion" INTEGER NOT NULL,
    "status" "SortingRunStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "drawIndex" INTEGER NOT NULL DEFAULT 0,
    "moves" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SortingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SortingDailyBest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "bestRunId" TEXT,
    "coinsPaid" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SortingDailyBest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SortingPayout" (
    "id" TEXT NOT NULL,
    "dailyBestId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scoreAtPayout" INTEGER NOT NULL,
    "coins" BIGINT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SortingPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcShop" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "keeperCopy" TEXT NOT NULL DEFAULT '',
    "keeperArtKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpcShop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcShopPoolEntry" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "shopRarity" "Rarity" NOT NULL,
    "price" BIGINT NOT NULL,
    "weight" INTEGER NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),

    CONSTRAINT "NpcShopPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcShopRestockConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "intervalMinutes" INTEGER NOT NULL DEFAULT 480,
    "anchorAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp without time zone,
    "targetListings" INTEGER NOT NULL DEFAULT 12,
    "commonMin" INTEGER NOT NULL DEFAULT 7,
    "commonMax" INTEGER NOT NULL DEFAULT 9,
    "uncommonMin" INTEGER NOT NULL DEFAULT 2,
    "uncommonMax" INTEGER NOT NULL DEFAULT 4,
    "rareMin" INTEGER NOT NULL DEFAULT 0,
    "rareMax" INTEGER NOT NULL DEFAULT 2,
    "ultraRareBps" INTEGER NOT NULL DEFAULT 300,
    "maxUltraRare" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NpcShopRestockConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopRestock" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "seedId" TEXT NOT NULL,
    "status" "RestockStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "ShopRestock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcShopStock" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "restockId" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "initialQuantity" INTEGER NOT NULL,
    "status" "NpcStockStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpcShopStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerShop" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "listingCapacity" INTEGER NOT NULL,
    "unclaimedProceeds" BIGINT NOT NULL DEFAULT 0,
    "lifetimeRevenue" BIGINT NOT NULL DEFAULT 0,
    "lifetimeCommission" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerShop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerShopListing" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemInstanceId" TEXT,
    "quantity" INTEGER NOT NULL,
    "quantityListed" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "status" "PlayerListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerShopListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerShopUpgradeTier" (
    "id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "capacityBonus" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlayerShopUpgradeTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerShopUpgradePurchase" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerShopUpgradePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitWindow" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandomEventState" (
    "userId" TEXT NOT NULL,
    "lastRollAt" TIMESTAMP(3) NOT NULL,
    "lastEventAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RandomEventState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RandomEventOccurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "coinsAwarded" BIGINT NOT NULL DEFAULT 0,
    "routePath" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RandomEventOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "counterpartyUserId" TEXT,
    "itemId" TEXT,
    "itemInstanceId" TEXT,
    "petId" TEXT,
    "npcStockId" TEXT,
    "playerListingId" TEXT,
    "restockId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "coinsDelta" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWordAnswer" (
    "id" TEXT NOT NULL,
    "difficulty" "WordDifficulty" NOT NULL,
    "word" TEXT NOT NULL,
    "sequencePosition" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWordAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWordPuzzle" (
    "id" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "difficulty" "WordDifficulty" NOT NULL,
    "band" INTEGER NOT NULL,
    "answerId" TEXT NOT NULL,
    "rewardCoins" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWordPuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWordResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "status" "DailyWordStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "attemptsUsed" INTEGER NOT NULL DEFAULT 0,
    "rewardCoins" BIGINT NOT NULL DEFAULT 0,
    "rewardTransactionId" TEXT,
    "solvedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWordResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWordGuess" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "guessNumber" INTEGER NOT NULL,
    "guess" TEXT NOT NULL,
    "evaluation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWordGuess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanternClue" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "clue" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LanternClue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanternHunt" (
    "id" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "band" INTEGER NOT NULL,
    "clueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LanternHunt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanternSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "huntId" TEXT NOT NULL,
    "status" "LanternSearchStatus" NOT NULL DEFAULT 'SEARCHING',
    "looksUsed" INTEGER NOT NULL DEFAULT 0,
    "rewardCoins" BIGINT NOT NULL DEFAULT 0,
    "rewardTransactionId" TEXT,
    "foundAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LanternSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LanternLook" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "lookNumber" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LanternLook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DailyWheel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheelConfiguration" (
    "id" TEXT NOT NULL,
    "wheelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWheelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheelPrize" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '',
    "resultType" "WheelResultType" NOT NULL,
    "weight" INTEGER NOT NULL,
    "coinAmount" BIGINT,
    "itemPoolId" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "flavorText" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DailyWheelPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheelItemPool" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DailyWheelItemPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheelItemPoolEntry" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectionWeight" INTEGER NOT NULL,
    "minimumQuantity" INTEGER NOT NULL DEFAULT 1,
    "maximumQuantity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DailyWheelItemPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheelSpin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wheelId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "awardedCoins" BIGINT NOT NULL DEFAULT 0,
    "awardedItemId" TEXT,
    "awardedQuantity" INTEGER,
    "rewardTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWheelSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyFoodPool" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "configurationVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DailyFoodPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyFoodPoolEntry" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectionWeight" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DailyFoodPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyFoodClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "poolConfigurationVersion" INTEGER NOT NULL,
    "awardedItemId" TEXT NOT NULL,
    "awardedQuantity" INTEGER NOT NULL,
    "rewardTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyFoodClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestBoard" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dailyCompletionLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestDefinition" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "flavorText" TEXT NOT NULL DEFAULT '',
    "sequencePosition" INTEGER NOT NULL,
    "rewardCoins" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestRequirement" (
    "id" TEXT NOT NULL,
    "requestDefinitionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "RequestRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRequestBoardProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "currentRequestDefinitionId" TEXT,
    "totalCompleted" INTEGER NOT NULL DEFAULT 0,
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRequestBoardProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "requestDefinitionId" TEXT NOT NULL,
    "completionOrdinal" INTEGER NOT NULL,
    "gameDate" TEXT NOT NULL,
    "rewardCoins" BIGINT NOT NULL,
    "requirementsSnapshot" JSONB NOT NULL,
    "transactionId" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayOffering" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "gameDate" TEXT NOT NULL,
    "donationOrdinal" INTEGER NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,

    CONSTRAINT "GiveawayOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayTake" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "takerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "takeOrdinal" INTEGER NOT NULL,
    "transactionId" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiveawayTake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumBoard" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,
    "staffOnly" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumThread" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visibility" "ForumVisibility" NOT NULL DEFAULT 'VISIBLE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "lastPostAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPost" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "ForumVisibility" NOT NULL DEFAULT 'VISIBLE',
    "ordinal" INTEGER NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "bodyAtReport" TEXT NOT NULL,
    "status" "ForumReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "type" "ModerationActionType" NOT NULL,
    "postId" TEXT,
    "threadId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaveSection" (
    "id" TEXT NOT NULL,
    "sectionIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "doorOne" TEXT NOT NULL,
    "doorTwo" TEXT NOT NULL,
    "turnedBackFlavor" TEXT NOT NULL,
    "onwardFlavor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaveSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaveHoardEntry" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "selectionWeight" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaveHoardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaveDelve" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "choices" TEXT NOT NULL DEFAULT '',
    "status" "CaveDelveStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "coinsEarned" BIGINT NOT NULL DEFAULT 0,
    "prizeItemId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CaveDelve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AilmentKind" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symptom" TEXT NOT NULL,
    "comfort" TEXT NOT NULL,
    "restHours" INTEGER NOT NULL,
    "happinessDrag" INTEGER NOT NULL DEFAULT 1,
    "healthCap" INTEGER NOT NULL DEFAULT 70,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AilmentKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetAilment" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restsAt" TIMESTAMP(3) NOT NULL,
    "treatedAt" TIMESTAMP(3),
    "remedyItemId" TEXT,

    CONSTRAINT "PetAilment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remedy" (
    "itemId" TEXT NOT NULL,
    "kindId" TEXT,
    "comfort" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "Remedy_pkey" PRIMARY KEY ("itemId")
);

-- CreateTable
CREATE TABLE "KeepsakeKind" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "line" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KeepsakeKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetKeepsake" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "kindId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenAt" TIMESTAMP(3),

    CONSTRAINT "PetKeepsake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PetGroomUse" (
    "id" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PetGroomUse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerTrophy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trophyKey" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerTrophy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FortuneSpin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stake" BIGINT NOT NULL,
    "symbols" TEXT NOT NULL,
    "line" TEXT NOT NULL DEFAULT '',
    "payout" BIGINT NOT NULL DEFAULT 0,
    "jackpot" BOOLEAN NOT NULL DEFAULT false,
    "stakeTransactionId" TEXT,
    "payoutTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FortuneSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FortuneJackpot" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pool" BIGINT NOT NULL DEFAULT 0,
    "minimum" BIGINT NOT NULL,
    "lastWonAt" TIMESTAMP(3),
    "lastWonBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FortuneJackpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shrine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "theme" "ShrineTheme" NOT NULL DEFAULT 'MIDNIGHT_WEB',
    "banner" TEXT NOT NULL DEFAULT '',
    "blink" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL DEFAULT '',
    "stickers" TEXT NOT NULL DEFAULT '',
    "effect" "ShrineEffect" NOT NULL DEFAULT 'NONE',
    "tune" "ShrineTune" NOT NULL DEFAULT 'NONE',
    "ringJoinedAt" TIMESTAMP(3),
    "visits" INTEGER NOT NULL DEFAULT 0,
    "guestbookOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shrine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShrineGuestbookEntry" (
    "id" TEXT NOT NULL,
    "shrineId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenById" TEXT,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShrineGuestbookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShrineVisit" (
    "id" TEXT NOT NULL,
    "shrineId" TEXT NOT NULL,
    "viewerKey" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShrineVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ItemToItemTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ItemToItemTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedUsername_key" ON "User"("normalizedUsername");

-- CreateIndex
CREATE UNIQUE INDEX "StarterClaim_userId_key" ON "StarterClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StarterClaim_petId_key" ON "StarterClaim"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseEntry_userId_itemId_key" ON "ShowcaseEntry"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseEntry_userId_position_key" ON "ShowcaseEntry"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "HollowGroundDefinition_key_key" ON "HollowGroundDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "HollowAnchorDefinition_groundId_key_key" ON "HollowAnchorDefinition"("groundId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "HollowAnchorDefinition_groundId_depth_key" ON "HollowAnchorDefinition"("groundId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "HollowAirDefinition_key_key" ON "HollowAirDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Hollow_userId_key" ON "Hollow"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HollowScene_hollowId_groundId_key" ON "HollowScene"("hollowId", "groundId");

-- CreateIndex
CREATE UNIQUE INDEX "HollowScene_hollowId_position_key" ON "HollowScene"("hollowId", "position");

-- CreateIndex
CREATE INDEX "HollowPlacement_itemId_idx" ON "HollowPlacement"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "HollowPlacement_sceneId_anchorKey_key" ON "HollowPlacement"("sceneId", "anchorKey");

-- CreateIndex
CREATE UNIQUE INDEX "HollowAirGrant_hollowId_airId_key" ON "HollowAirGrant"("hollowId", "airId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PetSpecies_slug_key" ON "PetSpecies"("slug");

-- CreateIndex
CREATE INDEX "Pet_ownerId_idx" ON "Pet"("ownerId");

-- CreateIndex
CREATE INDEX "PetBookReading_petId_lastReadAt_idx" ON "PetBookReading"("petId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetBookReading_petId_itemId_key" ON "PetBookReading"("petId", "itemId");

-- CreateIndex
CREATE INDEX "PetDelight_petId_firstAt_idx" ON "PetDelight"("petId", "firstAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetDelight_petId_itemId_key" ON "PetDelight"("petId", "itemId");

-- CreateIndex
CREATE INDEX "PetToyUse_petId_idx" ON "PetToyUse"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "PetToyUse_petId_itemId_key" ON "PetToyUse"("petId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_slug_key" ON "ItemCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTag_slug_key" ON "ItemTag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Item_slug_key" ON "Item"("slug");

-- CreateIndex
CREATE INDEX "ScratchPrize_cardItemId_active_idx" ON "ScratchPrize"("cardItemId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ScratchPrize_cardItemId_displayOrder_key" ON "ScratchPrize"("cardItemId", "displayOrder");

-- CreateIndex
CREATE INDEX "ScratchResult_userId_createdAt_idx" ON "ScratchResult"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScratchJackpot_slug_key" ON "ScratchJackpot"("slug");

-- CreateIndex
CREATE INDEX "SlotPrize_tokenItemId_active_idx" ON "SlotPrize"("tokenItemId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SlotPrize_tokenItemId_displayOrder_key" ON "SlotPrize"("tokenItemId", "displayOrder");

-- CreateIndex
CREATE INDEX "SlotSpin_userId_createdAt_idx" ON "SlotSpin"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryEntry_userId_idx" ON "InventoryEntry"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryEntry_userId_itemId_key" ON "InventoryEntry"("userId", "itemId");

-- CreateIndex
CREATE INDEX "ItemInstance_ownerId_status_idx" ON "ItemInstance"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ItemInstance_itemId_idx" ON "ItemInstance"("itemId");

-- CreateIndex
CREATE INDEX "ItemProvenanceEvent_itemInstanceId_createdAt_idx" ON "ItemProvenanceEvent"("itemInstanceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Region_slug_key" ON "Region"("slug");

-- CreateIndex
CREATE INDEX "Location_regionId_idx" ON "Location"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_regionId_slug_key" ON "Location"("regionId", "slug");

-- CreateIndex
CREATE INDEX "LocationActivity_locationId_active_displayOrder_idx" ON "LocationActivity"("locationId", "active", "displayOrder");

-- CreateIndex
CREATE INDEX "LocationActivity_type_activityKey_idx" ON "LocationActivity"("type", "activityKey");

-- CreateIndex
CREATE UNIQUE INDEX "LocationActivity_locationId_type_activityKey_key" ON "LocationActivity"("locationId", "type", "activityKey");

-- CreateIndex
CREATE UNIQUE INDEX "LocationActivity_locationId_displayOrder_key" ON "LocationActivity"("locationId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ForageSpot_slug_key" ON "ForageSpot"("slug");

-- CreateIndex
CREATE INDEX "ForageSpot_locationId_active_idx" ON "ForageSpot"("locationId", "active");

-- CreateIndex
CREATE INDEX "ForageSpotEntry_spotId_active_idx" ON "ForageSpotEntry"("spotId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ForageSpotEntry_spotId_itemId_key" ON "ForageSpotEntry"("spotId", "itemId");

-- CreateIndex
CREATE INDEX "ForageFind_userId_createdAt_idx" ON "ForageFind"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ForageFind_spotId_gameDate_idx" ON "ForageFind"("spotId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "ForageFind_userId_spotId_gameDate_searchOrdinal_key" ON "ForageFind"("userId", "spotId", "gameDate", "searchOrdinal");

-- CreateIndex
CREATE UNIQUE INDEX "FishingSpot_slug_key" ON "FishingSpot"("slug");

-- CreateIndex
CREATE INDEX "FishingSpot_locationId_idx" ON "FishingSpot"("locationId");

-- CreateIndex
CREATE INDEX "FishingSpotEntry_spotId_active_idx" ON "FishingSpotEntry"("spotId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "FishingSpotEntry_spotId_itemId_key" ON "FishingSpotEntry"("spotId", "itemId");

-- CreateIndex
CREATE INDEX "FishCatch_userId_createdAt_idx" ON "FishCatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FishCatch_spotId_gameDate_idx" ON "FishCatch"("spotId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "FishCatch_userId_spotId_gameDate_castOrdinal_key" ON "FishCatch"("userId", "spotId", "gameDate", "castOrdinal");

-- CreateIndex
CREATE INDEX "FishRecord_userId_lengthCm_idx" ON "FishRecord"("userId", "lengthCm");

-- CreateIndex
CREATE UNIQUE INDEX "FishRecord_userId_itemId_key" ON "FishRecord"("userId", "itemId");

-- CreateIndex
CREATE INDEX "ArcadeRun_userId_game_gameDate_idx" ON "ArcadeRun"("userId", "game", "gameDate");

-- CreateIndex
CREATE INDEX "ArcadeRun_userId_startedAt_idx" ON "ArcadeRun"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArcadePayout_runId_key" ON "ArcadePayout"("runId");

-- CreateIndex
CREATE INDEX "ArcadePayout_userId_createdAt_idx" ON "ArcadePayout"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArcadePayout_userId_gameDate_game_claimIndex_key" ON "ArcadePayout"("userId", "gameDate", "game", "claimIndex");

-- CreateIndex
CREATE INDEX "MatchingRun_userId_gameDate_idx" ON "MatchingRun"("userId", "gameDate");

-- CreateIndex
CREATE INDEX "MatchingRun_userId_startedAt_idx" ON "MatchingRun"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingPayout_runId_key" ON "MatchingPayout"("runId");

-- CreateIndex
CREATE INDEX "MatchingPayout_userId_createdAt_idx" ON "MatchingPayout"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingPayout_userId_gameDate_difficulty_key" ON "MatchingPayout"("userId", "gameDate", "difficulty");

-- CreateIndex
CREATE INDEX "SudokuPuzzle_gameDate_idx" ON "SudokuPuzzle"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "SudokuPuzzle_gameDate_band_key" ON "SudokuPuzzle"("gameDate", "band");

-- CreateIndex
CREATE INDEX "SudokuAttempt_userId_startedAt_idx" ON "SudokuAttempt"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SudokuAttempt_userId_gameDate_key" ON "SudokuAttempt"("userId", "gameDate");

-- CreateIndex
CREATE INDEX "SortingRun_userId_gameDate_idx" ON "SortingRun"("userId", "gameDate");

-- CreateIndex
CREATE INDEX "SortingRun_userId_startedAt_idx" ON "SortingRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "SortingDailyBest_gameDate_idx" ON "SortingDailyBest"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "SortingDailyBest_userId_gameDate_key" ON "SortingDailyBest"("userId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "SortingPayout_transactionId_key" ON "SortingPayout"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "NpcShop_locationId_key" ON "NpcShop"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "NpcShop_slug_key" ON "NpcShop"("slug");

-- CreateIndex
CREATE INDEX "NpcShopPoolEntry_shopId_active_idx" ON "NpcShopPoolEntry"("shopId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "NpcShopPoolEntry_shopId_itemId_key" ON "NpcShopPoolEntry"("shopId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "NpcShopRestockConfig_shopId_key" ON "NpcShopRestockConfig"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopRestock_shopId_windowStart_key" ON "ShopRestock"("shopId", "windowStart");

-- CreateIndex
CREATE INDEX "NpcShopStock_shopId_status_idx" ON "NpcShopStock"("shopId", "status");

-- CreateIndex
CREATE INDEX "NpcShopStock_itemId_status_idx" ON "NpcShopStock"("itemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerShop_ownerId_key" ON "PlayerShop"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerShop_slug_key" ON "PlayerShop"("slug");

-- CreateIndex
CREATE INDEX "PlayerShopListing_shopId_status_idx" ON "PlayerShopListing"("shopId", "status");

-- CreateIndex
CREATE INDEX "PlayerShopListing_itemId_status_unitPrice_idx" ON "PlayerShopListing"("itemId", "status", "unitPrice");

-- CreateIndex
CREATE INDEX "PlayerShopListing_sellerId_status_idx" ON "PlayerShopListing"("sellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerShopUpgradeTier_tier_key" ON "PlayerShopUpgradeTier"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerShopUpgradePurchase_shopId_tierId_key" ON "PlayerShopUpgradePurchase"("shopId", "tierId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_operation_key_key" ON "IdempotencyKey"("userId", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitWindow_key_windowStart_key" ON "RateLimitWindow"("key", "windowStart");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RandomEventOccurrence_userId_createdAt_idx" ON "RandomEventOccurrence"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RandomEventOccurrence_userId_gameDate_idx" ON "RandomEventOccurrence"("userId", "gameDate");

-- CreateIndex
CREATE INDEX "RandomEventOccurrence_eventKey_idx" ON "RandomEventOccurrence"("eventKey");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_itemId_createdAt_idx" ON "Transaction"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_playerListingId_idx" ON "Transaction"("playerListingId");

-- CreateIndex
CREATE INDEX "Transaction_restockId_idx" ON "Transaction"("restockId");

-- CreateIndex
CREATE INDEX "Transaction_type_createdAt_idx" ON "Transaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "DailyWordAnswer_difficulty_active_sequencePosition_idx" ON "DailyWordAnswer"("difficulty", "active", "sequencePosition");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordAnswer_difficulty_sequencePosition_key" ON "DailyWordAnswer"("difficulty", "sequencePosition");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordAnswer_difficulty_word_key" ON "DailyWordAnswer"("difficulty", "word");

-- CreateIndex
CREATE INDEX "DailyWordPuzzle_gameDate_idx" ON "DailyWordPuzzle"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordPuzzle_gameDate_difficulty_band_key" ON "DailyWordPuzzle"("gameDate", "difficulty", "band");

-- CreateIndex
CREATE INDEX "DailyWordResult_userId_createdAt_idx" ON "DailyWordResult"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyWordResult_puzzleId_status_idx" ON "DailyWordResult"("puzzleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordResult_userId_puzzleId_key" ON "DailyWordResult"("userId", "puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordGuess_resultId_guessNumber_key" ON "DailyWordGuess"("resultId", "guessNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LanternClue_locationId_key" ON "LanternClue"("locationId");

-- CreateIndex
CREATE INDEX "LanternClue_active_idx" ON "LanternClue"("active");

-- CreateIndex
CREATE INDEX "LanternHunt_gameDate_idx" ON "LanternHunt"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "LanternHunt_gameDate_band_key" ON "LanternHunt"("gameDate", "band");

-- CreateIndex
CREATE INDEX "LanternSearch_userId_createdAt_idx" ON "LanternSearch"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LanternSearch_userId_huntId_key" ON "LanternSearch"("userId", "huntId");

-- CreateIndex
CREATE UNIQUE INDEX "LanternLook_searchId_lookNumber_key" ON "LanternLook"("searchId", "lookNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWheel_slug_key" ON "DailyWheel"("slug");

-- CreateIndex
CREATE INDEX "DailyWheelConfiguration_wheelId_active_idx" ON "DailyWheelConfiguration"("wheelId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWheelConfiguration_wheelId_version_key" ON "DailyWheelConfiguration"("wheelId", "version");

-- CreateIndex
CREATE INDEX "DailyWheelPrize_configurationId_active_idx" ON "DailyWheelPrize"("configurationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWheelItemPool_slug_key" ON "DailyWheelItemPool"("slug");

-- CreateIndex
CREATE INDEX "DailyWheelItemPoolEntry_poolId_active_idx" ON "DailyWheelItemPoolEntry"("poolId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWheelItemPoolEntry_poolId_itemId_key" ON "DailyWheelItemPoolEntry"("poolId", "itemId");

-- CreateIndex
CREATE INDEX "DailyWheelSpin_userId_createdAt_idx" ON "DailyWheelSpin"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyWheelSpin_gameDate_idx" ON "DailyWheelSpin"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWheelSpin_userId_wheelId_gameDate_key" ON "DailyWheelSpin"("userId", "wheelId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyFoodPool_slug_key" ON "DailyFoodPool"("slug");

-- CreateIndex
CREATE INDEX "DailyFoodPoolEntry_poolId_active_idx" ON "DailyFoodPoolEntry"("poolId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DailyFoodPoolEntry_poolId_itemId_key" ON "DailyFoodPoolEntry"("poolId", "itemId");

-- CreateIndex
CREATE INDEX "DailyFoodClaim_userId_createdAt_idx" ON "DailyFoodClaim"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyFoodClaim_gameDate_idx" ON "DailyFoodClaim"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyFoodClaim_userId_gameDate_poolId_key" ON "DailyFoodClaim"("userId", "gameDate", "poolId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestBoard_key_key" ON "RequestBoard"("key");

-- CreateIndex
CREATE INDEX "RequestDefinition_boardId_active_sequencePosition_idx" ON "RequestDefinition"("boardId", "active", "sequencePosition");

-- CreateIndex
CREATE UNIQUE INDEX "RequestDefinition_boardId_slug_key" ON "RequestDefinition"("boardId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "RequestDefinition_boardId_sequencePosition_key" ON "RequestDefinition"("boardId", "sequencePosition");

-- CreateIndex
CREATE INDEX "RequestRequirement_itemId_idx" ON "RequestRequirement"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestRequirement_requestDefinitionId_itemId_key" ON "RequestRequirement"("requestDefinitionId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRequestBoardProgress_userId_boardId_key" ON "PlayerRequestBoardProgress"("userId", "boardId");

-- CreateIndex
CREATE INDEX "RequestCompletion_userId_boardId_gameDate_idx" ON "RequestCompletion"("userId", "boardId", "gameDate");

-- CreateIndex
CREATE INDEX "RequestCompletion_boardId_completedAt_idx" ON "RequestCompletion"("boardId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCompletion_userId_boardId_completionOrdinal_key" ON "RequestCompletion"("userId", "boardId", "completionOrdinal");

-- CreateIndex
CREATE INDEX "GiveawayOffering_expiresAt_remaining_idx" ON "GiveawayOffering"("expiresAt", "remaining");

-- CreateIndex
CREATE INDEX "GiveawayOffering_donorId_offeredAt_idx" ON "GiveawayOffering"("donorId", "offeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayOffering_donorId_gameDate_donationOrdinal_key" ON "GiveawayOffering"("donorId", "gameDate", "donationOrdinal");

-- CreateIndex
CREATE INDEX "GiveawayTake_takerId_takenAt_idx" ON "GiveawayTake"("takerId", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayTake_offeringId_takerId_key" ON "GiveawayTake"("offeringId", "takerId");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayTake_takerId_gameDate_takeOrdinal_key" ON "GiveawayTake"("takerId", "gameDate", "takeOrdinal");

-- CreateIndex
CREATE UNIQUE INDEX "ForumBoard_slug_key" ON "ForumBoard"("slug");

-- CreateIndex
CREATE INDEX "ForumBoard_position_idx" ON "ForumBoard"("position");

-- CreateIndex
CREATE INDEX "ForumThread_boardId_pinned_lastPostAt_idx" ON "ForumThread"("boardId", "pinned", "lastPostAt");

-- CreateIndex
CREATE INDEX "ForumThread_authorId_createdAt_idx" ON "ForumThread"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_authorId_createdAt_idx" ON "ForumPost"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumPost_threadId_ordinal_key" ON "ForumPost"("threadId", "ordinal");

-- CreateIndex
CREATE INDEX "ForumReport_status_createdAt_idx" ON "ForumReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumReport_postId_reporterId_key" ON "ForumReport"("postId", "reporterId");

-- CreateIndex
CREATE INDEX "ModerationAction_moderatorId_createdAt_idx" ON "ModerationAction"("moderatorId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaveSection_sectionIndex_key" ON "CaveSection"("sectionIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CaveHoardEntry_itemId_key" ON "CaveHoardEntry"("itemId");

-- CreateIndex
CREATE INDEX "CaveHoardEntry_active_idx" ON "CaveHoardEntry"("active");

-- CreateIndex
CREATE INDEX "CaveDelve_userId_status_idx" ON "CaveDelve"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CaveDelve_userId_gameDate_key" ON "CaveDelve"("userId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "AilmentKind_key_key" ON "AilmentKind"("key");

-- CreateIndex
CREATE INDEX "PetAilment_petId_treatedAt_idx" ON "PetAilment"("petId", "treatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetAilment_petId_gameDate_key" ON "PetAilment"("petId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "KeepsakeKind_itemId_key" ON "KeepsakeKind"("itemId");

-- CreateIndex
CREATE INDEX "PetKeepsake_petId_takenAt_idx" ON "PetKeepsake"("petId", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PetKeepsake_petId_gameDate_key" ON "PetKeepsake"("petId", "gameDate");

-- CreateIndex
CREATE INDEX "PetGroomUse_petId_idx" ON "PetGroomUse"("petId");

-- CreateIndex
CREATE UNIQUE INDEX "PetGroomUse_petId_itemId_key" ON "PetGroomUse"("petId", "itemId");

-- CreateIndex
CREATE INDEX "PlayerTrophy_userId_earnedAt_idx" ON "PlayerTrophy"("userId", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerTrophy_userId_trophyKey_key" ON "PlayerTrophy"("userId", "trophyKey");

-- CreateIndex
CREATE INDEX "FortuneSpin_userId_createdAt_idx" ON "FortuneSpin"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FortuneSpin_jackpot_createdAt_idx" ON "FortuneSpin"("jackpot", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FortuneJackpot_slug_key" ON "FortuneJackpot"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Shrine_userId_key" ON "Shrine"("userId");

-- CreateIndex
CREATE INDEX "ShrineGuestbookEntry_shrineId_createdAt_idx" ON "ShrineGuestbookEntry"("shrineId", "createdAt");

-- CreateIndex
CREATE INDEX "ShrineGuestbookEntry_authorId_createdAt_idx" ON "ShrineGuestbookEntry"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShrineVisit_shrineId_viewerKey_day_key" ON "ShrineVisit"("shrineId", "viewerKey", "day");

-- CreateIndex
CREATE INDEX "_ItemToItemTag_B_index" ON "_ItemToItemTag"("B");

-- AddForeignKey
ALTER TABLE "StarterClaim" ADD CONSTRAINT "StarterClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterClaim" ADD CONSTRAINT "StarterClaim_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_featuredPetId_fkey" FOREIGN KEY ("featuredPetId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "ItemInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowAnchorDefinition" ADD CONSTRAINT "HollowAnchorDefinition_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "HollowGroundDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hollow" ADD CONSTRAINT "Hollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowScene" ADD CONSTRAINT "HollowScene_hollowId_fkey" FOREIGN KEY ("hollowId") REFERENCES "Hollow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowScene" ADD CONSTRAINT "HollowScene_groundId_fkey" FOREIGN KEY ("groundId") REFERENCES "HollowGroundDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowScene" ADD CONSTRAINT "HollowScene_airId_fkey" FOREIGN KEY ("airId") REFERENCES "HollowAirDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowPlacement" ADD CONSTRAINT "HollowPlacement_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "HollowScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowPlacement" ADD CONSTRAINT "HollowPlacement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowAirGrant" ADD CONSTRAINT "HollowAirGrant_hollowId_fkey" FOREIGN KEY ("hollowId") REFERENCES "Hollow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HollowAirGrant" ADD CONSTRAINT "HollowAirGrant_airId_fkey" FOREIGN KEY ("airId") REFERENCES "HollowAirDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetBookReading" ADD CONSTRAINT "PetBookReading_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetBookReading" ADD CONSTRAINT "PetBookReading_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetDelight" ADD CONSTRAINT "PetDelight_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetDelight" ADD CONSTRAINT "PetDelight_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetToyUse" ADD CONSTRAINT "PetToyUse_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetToyUse" ADD CONSTRAINT "PetToyUse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchCard" ADD CONSTRAINT "ScratchCard_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchPrize" ADD CONSTRAINT "ScratchPrize_cardItemId_fkey" FOREIGN KEY ("cardItemId") REFERENCES "ScratchCard"("itemId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchPrize" ADD CONSTRAINT "ScratchPrize_prizeItemId_fkey" FOREIGN KEY ("prizeItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchResult" ADD CONSTRAINT "ScratchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchResult" ADD CONSTRAINT "ScratchResult_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "ScratchPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchResult" ADD CONSTRAINT "ScratchResult_awardedItemId_fkey" FOREIGN KEY ("awardedItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchResult" ADD CONSTRAINT "ScratchResult_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScratchJackpot" ADD CONSTRAINT "ScratchJackpot_lastWonBy_fkey" FOREIGN KEY ("lastWonBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpinToken" ADD CONSTRAINT "SpinToken_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotPrize" ADD CONSTRAINT "SlotPrize_tokenItemId_fkey" FOREIGN KEY ("tokenItemId") REFERENCES "SpinToken"("itemId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotPrize" ADD CONSTRAINT "SlotPrize_prizeItemId_fkey" FOREIGN KEY ("prizeItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "SlotPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_awardedItemId_fkey" FOREIGN KEY ("awardedItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Furnishing" ADD CONSTRAINT "Furnishing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "InventoryEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "InventoryEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemInstance" ADD CONSTRAINT "ItemInstance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemInstance" ADD CONSTRAINT "ItemInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "ItemInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationActivity" ADD CONSTRAINT "LocationActivity_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForageSpot" ADD CONSTRAINT "ForageSpot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForageSpotEntry" ADD CONSTRAINT "ForageSpotEntry_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ForageSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForageSpotEntry" ADD CONSTRAINT "ForageSpotEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForageFind" ADD CONSTRAINT "ForageFind_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForageFind" ADD CONSTRAINT "ForageFind_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ForageSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForageFind" ADD CONSTRAINT "ForageFind_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForageFind" ADD CONSTRAINT "ForageFind_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishingSpot" ADD CONSTRAINT "FishingSpot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishingSpotEntry" ADD CONSTRAINT "FishingSpotEntry_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "FishingSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishingSpotEntry" ADD CONSTRAINT "FishingSpotEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishCatch" ADD CONSTRAINT "FishCatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishCatch" ADD CONSTRAINT "FishCatch_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "FishingSpot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishCatch" ADD CONSTRAINT "FishCatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishCatch" ADD CONSTRAINT "FishCatch_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishRecord" ADD CONSTRAINT "FishRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FishRecord" ADD CONSTRAINT "FishRecord_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcadeRun" ADD CONSTRAINT "ArcadeRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcadePayout" ADD CONSTRAINT "ArcadePayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcadePayout" ADD CONSTRAINT "ArcadePayout_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ArcadeRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcadePayout" ADD CONSTRAINT "ArcadePayout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingRun" ADD CONSTRAINT "MatchingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingPayout" ADD CONSTRAINT "MatchingPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingPayout" ADD CONSTRAINT "MatchingPayout_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MatchingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingPayout" ADD CONSTRAINT "MatchingPayout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_gameDate_band_fkey" FOREIGN KEY ("gameDate", "band") REFERENCES "SudokuPuzzle"("gameDate", "band") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortingRun" ADD CONSTRAINT "SortingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortingDailyBest" ADD CONSTRAINT "SortingDailyBest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortingPayout" ADD CONSTRAINT "SortingPayout_dailyBestId_fkey" FOREIGN KEY ("dailyBestId") REFERENCES "SortingDailyBest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortingPayout" ADD CONSTRAINT "SortingPayout_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SortingRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SortingPayout" ADD CONSTRAINT "SortingPayout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcShop" ADD CONSTRAINT "NpcShop_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "NpcShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "NpcShopRestockConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "NpcShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopRestock" ADD CONSTRAINT "ShopRestock_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "NpcShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "NpcShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_restockId_fkey" FOREIGN KEY ("restockId") REFERENCES "ShopRestock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PlayerShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "ItemInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopUpgradePurchase" ADD CONSTRAINT "PlayerShopUpgradePurchase_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PlayerShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopUpgradePurchase" ADD CONSTRAINT "PlayerShopUpgradePurchase_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PlayerShopUpgradeTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomEventState" ADD CONSTRAINT "RandomEventState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomEventOccurrence" ADD CONSTRAINT "RandomEventOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomEventOccurrence" ADD CONSTRAINT "RandomEventOccurrence_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_counterpartyUserId_fkey" FOREIGN KEY ("counterpartyUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "ItemInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_npcStockId_fkey" FOREIGN KEY ("npcStockId") REFERENCES "NpcShopStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_playerListingId_fkey" FOREIGN KEY ("playerListingId") REFERENCES "PlayerShopListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_restockId_fkey" FOREIGN KEY ("restockId") REFERENCES "ShopRestock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWordPuzzle" ADD CONSTRAINT "DailyWordPuzzle_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "DailyWordAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWordResult" ADD CONSTRAINT "DailyWordResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWordResult" ADD CONSTRAINT "DailyWordResult_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "DailyWordPuzzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWordResult" ADD CONSTRAINT "DailyWordResult_rewardTransactionId_fkey" FOREIGN KEY ("rewardTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWordGuess" ADD CONSTRAINT "DailyWordGuess_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "DailyWordResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanternClue" ADD CONSTRAINT "LanternClue_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanternHunt" ADD CONSTRAINT "LanternHunt_clueId_fkey" FOREIGN KEY ("clueId") REFERENCES "LanternClue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanternSearch" ADD CONSTRAINT "LanternSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanternSearch" ADD CONSTRAINT "LanternSearch_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "LanternHunt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanternSearch" ADD CONSTRAINT "LanternSearch_rewardTransactionId_fkey" FOREIGN KEY ("rewardTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanternLook" ADD CONSTRAINT "LanternLook_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LanternSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LanternLook" ADD CONSTRAINT "LanternLook_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelConfiguration" ADD CONSTRAINT "DailyWheelConfiguration_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "DailyWheel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelPrize" ADD CONSTRAINT "DailyWheelPrize_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "DailyWheelConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelPrize" ADD CONSTRAINT "DailyWheelPrize_itemPoolId_fkey" FOREIGN KEY ("itemPoolId") REFERENCES "DailyWheelItemPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelItemPoolEntry" ADD CONSTRAINT "DailyWheelItemPoolEntry_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "DailyWheelItemPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelItemPoolEntry" ADD CONSTRAINT "DailyWheelItemPoolEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_wheelId_fkey" FOREIGN KEY ("wheelId") REFERENCES "DailyWheel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "DailyWheelConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "DailyWheelPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_awardedItemId_fkey" FOREIGN KEY ("awardedItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_rewardTransactionId_fkey" FOREIGN KEY ("rewardTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFoodPoolEntry" ADD CONSTRAINT "DailyFoodPoolEntry_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "DailyFoodPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFoodPoolEntry" ADD CONSTRAINT "DailyFoodPoolEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFoodClaim" ADD CONSTRAINT "DailyFoodClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFoodClaim" ADD CONSTRAINT "DailyFoodClaim_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "DailyFoodPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFoodClaim" ADD CONSTRAINT "DailyFoodClaim_awardedItemId_fkey" FOREIGN KEY ("awardedItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyFoodClaim" ADD CONSTRAINT "DailyFoodClaim_rewardTransactionId_fkey" FOREIGN KEY ("rewardTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDefinition" ADD CONSTRAINT "RequestDefinition_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "RequestBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestRequirement" ADD CONSTRAINT "RequestRequirement_requestDefinitionId_fkey" FOREIGN KEY ("requestDefinitionId") REFERENCES "RequestDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestRequirement" ADD CONSTRAINT "RequestRequirement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRequestBoardProgress" ADD CONSTRAINT "PlayerRequestBoardProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRequestBoardProgress" ADD CONSTRAINT "PlayerRequestBoardProgress_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "RequestBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRequestBoardProgress" ADD CONSTRAINT "PlayerRequestBoardProgress_currentRequestDefinitionId_fkey" FOREIGN KEY ("currentRequestDefinitionId") REFERENCES "RequestDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCompletion" ADD CONSTRAINT "RequestCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCompletion" ADD CONSTRAINT "RequestCompletion_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "RequestBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCompletion" ADD CONSTRAINT "RequestCompletion_requestDefinitionId_fkey" FOREIGN KEY ("requestDefinitionId") REFERENCES "RequestDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestCompletion" ADD CONSTRAINT "RequestCompletion_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayTake" ADD CONSTRAINT "GiveawayTake_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "GiveawayOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayTake" ADD CONSTRAINT "GiveawayTake_takerId_fkey" FOREIGN KEY ("takerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayTake" ADD CONSTRAINT "GiveawayTake_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayTake" ADD CONSTRAINT "GiveawayTake_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "ForumBoard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaveHoardEntry" ADD CONSTRAINT "CaveHoardEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaveDelve" ADD CONSTRAINT "CaveDelve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaveDelve" ADD CONSTRAINT "CaveDelve_prizeItemId_fkey" FOREIGN KEY ("prizeItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetAilment" ADD CONSTRAINT "PetAilment_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetAilment" ADD CONSTRAINT "PetAilment_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "AilmentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetAilment" ADD CONSTRAINT "PetAilment_remedyItemId_fkey" FOREIGN KEY ("remedyItemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remedy" ADD CONSTRAINT "Remedy_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remedy" ADD CONSTRAINT "Remedy_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "AilmentKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeepsakeKind" ADD CONSTRAINT "KeepsakeKind_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetKeepsake" ADD CONSTRAINT "PetKeepsake_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetKeepsake" ADD CONSTRAINT "PetKeepsake_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "KeepsakeKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetGroomUse" ADD CONSTRAINT "PetGroomUse_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetGroomUse" ADD CONSTRAINT "PetGroomUse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerTrophy" ADD CONSTRAINT "PlayerTrophy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortuneSpin" ADD CONSTRAINT "FortuneSpin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortuneSpin" ADD CONSTRAINT "FortuneSpin_stakeTransactionId_fkey" FOREIGN KEY ("stakeTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortuneSpin" ADD CONSTRAINT "FortuneSpin_payoutTransactionId_fkey" FOREIGN KEY ("payoutTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FortuneJackpot" ADD CONSTRAINT "FortuneJackpot_lastWonBy_fkey" FOREIGN KEY ("lastWonBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shrine" ADD CONSTRAINT "Shrine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShrineGuestbookEntry" ADD CONSTRAINT "ShrineGuestbookEntry_shrineId_fkey" FOREIGN KEY ("shrineId") REFERENCES "Shrine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShrineGuestbookEntry" ADD CONSTRAINT "ShrineGuestbookEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShrineGuestbookEntry" ADD CONSTRAINT "ShrineGuestbookEntry_hiddenById_fkey" FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShrineVisit" ADD CONSTRAINT "ShrineVisit_shrineId_fkey" FOREIGN KEY ("shrineId") REFERENCES "Shrine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToItemTag" ADD CONSTRAINT "_ItemToItemTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToItemTag" ADD CONSTRAINT "_ItemToItemTag_B_fkey" FOREIGN KEY ("B") REFERENCES "ItemTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written safeguards (Prisma does not model CHECK constraints or
-- partial indexes). Squashed pre-alpha baseline (docs/conventions.md);
-- carried forward from the phase 1-4 migrations.
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD CONSTRAINT "User_coins_nonnegative" CHECK ("coins" >= 0);
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "InventoryEntry_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "Item" ADD CONSTRAINT "Item_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "Item" ADD CONSTRAINT "Item_provenance_requires_instances" CHECK ("provenancePolicy" = 'NONE' OR "stackable" = false);
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "Location" ADD CONSTRAINT "Location_map_position_bounds" CHECK (
  ("mapX" IS NULL OR ("mapX" >= 0 AND "mapX" <= 100)) AND
  ("mapY" IS NULL OR ("mapY" >= 0 AND "mapY" <= 100))
);
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_initial_gte_remaining" CHECK ("initialQuantity" >= "quantity");
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_weight_positive" CHECK ("weight" > 0);
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_quantity_bounds" CHECK ("minQuantity" >= 1 AND "maxQuantity" >= "minQuantity");
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_interval_positive" CHECK ("intervalMinutes" > 0);
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_target_positive" CHECK ("targetListings" > 0);
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_tier_bounds" CHECK (
  "commonMin" >= 0 AND "commonMax" >= "commonMin" AND
  "uncommonMin" >= 0 AND "uncommonMax" >= "uncommonMin" AND
  "rareMin" >= 0 AND "rareMax" >= "rareMin" AND
  "maxUltraRare" >= 0
);
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_bps_range" CHECK ("ultraRareBps" >= 0 AND "ultraRareBps" <= 10000);
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_proceeds_nonnegative" CHECK ("unclaimedProceeds" >= 0);
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_revenue_nonnegative" CHECK ("lifetimeRevenue" >= 0);
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_commission_nonnegative" CHECK ("lifetimeCommission" >= 0);

-- Forums. The body and title bounds mirror the Zod schemas rather than
-- trusting them: validation is the first gate, not the only one.
ALTER TABLE "ForumBoard" ADD CONSTRAINT "ForumBoard_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_replies_nonnegative" CHECK ("replyCount" >= 0);
ALTER TABLE "ForumThread" ADD CONSTRAINT "ForumThread_title_length" CHECK (char_length("title") BETWEEN 3 AND 120);
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_ordinal_positive" CHECK ("ordinal" >= 1);
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_body_length" CHECK (char_length("body") BETWEEN 1 AND 8000);
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_reason_length" CHECK (char_length("reason") <= 1000);
-- A moderation action is about a post or a thread, never both and never
-- neither. Left to the caller this drifts the first time somebody adds an
-- action type in a hurry.
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_one_subject" CHECK (
  ("postId" IS NOT NULL AND "threadId" IS NULL)
  OR ("postId" IS NULL AND "threadId" IS NOT NULL)
);
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_capacity_nonnegative" CHECK ("listingCapacity" >= 0);
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_price_positive" CHECK ("unitPrice" >= 1);
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_listed_positive" CHECK ("quantityListed" >= 1);
-- Partial purchases only ever take units away, so what remains can never
-- exceed what was listed. Catches a decrement that ran the wrong way.
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_quantity_within_listed" CHECK ("quantity" <= "quantityListed");
ALTER TABLE "PlayerShopUpgradeTier" ADD CONSTRAINT "UpgradeTier_price_positive" CHECK ("price" > 0);
ALTER TABLE "PlayerShopUpgradeTier" ADD CONSTRAINT "UpgradeTier_bonus_positive" CHECK ("capacityBonus" > 0);

-- An item instance may back at most one ACTIVE listing (partial unique
-- index; resale after SOLD/CANCELLED creates a new listing row).
CREATE UNIQUE INDEX "PlayerShopListing_active_instance_key"
  ON "PlayerShopListing"("itemInstanceId")
  WHERE "status" = 'ACTIVE' AND "itemInstanceId" IS NOT NULL;

ALTER TABLE "DailyWordAnswer" ADD CONSTRAINT "DailyWordAnswer_word_shape" CHECK ("word" ~ '^[A-Z]{4,6}$');
ALTER TABLE "DailyWordAnswer" ADD CONSTRAINT "DailyWordAnswer_position_nonnegative" CHECK ("sequencePosition" >= 0);
ALTER TABLE "DailyWordPuzzle" ADD CONSTRAINT "DailyWordPuzzle_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "DailyWordPuzzle" ADD CONSTRAINT "DailyWordPuzzle_reward_nonnegative" CHECK ("rewardCoins" >= 0);
-- Lower bound only: the band count is configuration (WORD_BANDS) and may be
-- raised without a migration, so an upper bound here would be a false floor.
ALTER TABLE "DailyWordPuzzle" ADD CONSTRAINT "DailyWordPuzzle_band_nonnegative" CHECK ("band" >= 0);
ALTER TABLE "DailyWordResult" ADD CONSTRAINT "DailyWordResult_attempts_bounds" CHECK ("attemptsUsed" >= 0 AND "attemptsUsed" <= 5);
ALTER TABLE "DailyWordResult" ADD CONSTRAINT "DailyWordResult_reward_nonnegative" CHECK ("rewardCoins" >= 0);
ALTER TABLE "LanternHunt" ADD CONSTRAINT "LanternHunt_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "LanternHunt" ADD CONSTRAINT "LanternHunt_band_nonnegative" CHECK ("band" >= 0);
ALTER TABLE "SudokuPuzzle" ADD CONSTRAINT "SudokuPuzzle_band_nonnegative" CHECK ("band" >= 0);
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_band_nonnegative" CHECK ("band" >= 0);
-- The look ceiling is configuration (LOOKS_PER_DAY) but a look count that
-- runs away is a bug worth stopping at the database, not a preference.
ALTER TABLE "LanternSearch" ADD CONSTRAINT "LanternSearch_looks_bounds" CHECK ("looksUsed" >= 0 AND "looksUsed" <= 3);
ALTER TABLE "LanternSearch" ADD CONSTRAINT "LanternSearch_reward_nonnegative" CHECK ("rewardCoins" >= 0);
ALTER TABLE "LanternLook" ADD CONSTRAINT "LanternLook_number_positive" CHECK ("lookNumber" >= 1);
ALTER TABLE "ScratchCard" ADD CONSTRAINT "ScratchCard_tier_bounds" CHECK ("tier" >= 1 AND "tier" <= 3);
-- A weight over the full 10000 basis points cannot be part of a valid
-- table; the exact per-card sum is checked offline, where the whole table
-- is visible at once.
ALTER TABLE "ScratchPrize" ADD CONSTRAINT "ScratchPrize_weight_range" CHECK ("weight" >= 1 AND "weight" <= 10000);
ALTER TABLE "ScratchPrize" ADD CONSTRAINT "ScratchPrize_quantity_positive" CHECK ("quantity" >= 1);
-- Exactly one payload per outcome, and none at all for the two that
-- cannot carry one: a loss pays nothing, and the jackpot pays whatever
-- the pool stands at when the salt comes off.
ALTER TABLE "ScratchPrize" ADD CONSTRAINT "ScratchPrize_one_payload" CHECK (
  ("kind" = 'COINS' AND "coinAmount" IS NOT NULL AND "coinAmount" > 0 AND "prizeItemId" IS NULL)
  OR ("kind" = 'ITEM' AND "prizeItemId" IS NOT NULL AND "coinAmount" IS NULL)
  OR ("kind" IN ('NOTHING', 'JACKPOT') AND "coinAmount" IS NULL AND "prizeItemId" IS NULL)
);
ALTER TABLE "ScratchJackpot" ADD CONSTRAINT "ScratchJackpot_pool_nonnegative" CHECK ("pool" >= 0);
ALTER TABLE "ScratchJackpot" ADD CONSTRAINT "ScratchJackpot_minimum_positive" CHECK ("minimum" > 0);
ALTER TABLE "ScratchResult" ADD CONSTRAINT "ScratchResult_coins_nonnegative" CHECK ("awardedCoins" >= 0);
ALTER TABLE "ScratchResult" ADD CONSTRAINT "ScratchResult_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "FishingSpot" ADD CONSTRAINT "FishingSpot_daily_limit_positive" CHECK ("dailyLimit" >= 1);
ALTER TABLE "FishingSpot" ADD CONSTRAINT "FishingSpot_empty_weight_nonnegative" CHECK ("emptyWeight" >= 0);
ALTER TABLE "FishingSpotEntry" ADD CONSTRAINT "FishingSpotEntry_weight_positive" CHECK ("selectionWeight" > 0);
-- A length range that runs backwards would draw from an empty interval.
ALTER TABLE "FishingSpotEntry" ADD CONSTRAINT "FishingSpotEntry_length_range" CHECK ("minLength" >= 1 AND "maxLength" >= "minLength");
ALTER TABLE "FishCatch" ADD CONSTRAINT "FishCatch_ordinal_positive" CHECK ("castOrdinal" >= 1);
-- Zero length only for an empty cast; a caught fish always has a size.
ALTER TABLE "FishCatch" ADD CONSTRAINT "FishCatch_length_matches_catch" CHECK (
  ("itemId" IS NULL AND "lengthCm" = 0) OR ("itemId" IS NOT NULL AND "lengthCm" >= 1)
);
ALTER TABLE "FishRecord" ADD CONSTRAINT "FishRecord_length_positive" CHECK ("lengthCm" >= 1);
ALTER TABLE "MatchingRun" ADD CONSTRAINT "MatchingRun_pairs_nonnegative" CHECK ("pairsFound" >= 0);
ALTER TABLE "MatchingPayout" ADD CONSTRAINT "MatchingPayout_coins_positive" CHECK ("coins" > 0);
ALTER TABLE "DailyWordGuess" ADD CONSTRAINT "DailyWordGuess_number_bounds" CHECK ("guessNumber" >= 1 AND "guessNumber" <= 5);
ALTER TABLE "DailyWheelPrize" ADD CONSTRAINT "DailyWheelPrize_weight_positive" CHECK ("weight" > 0);
ALTER TABLE "DailyWheelPrize" ADD CONSTRAINT "DailyWheelPrize_coins_nonnegative" CHECK ("coinAmount" IS NULL OR "coinAmount" >= 0);
ALTER TABLE "DailyWheelItemPoolEntry" ADD CONSTRAINT "WheelPoolEntry_weight_positive" CHECK ("selectionWeight" > 0);
ALTER TABLE "DailyWheelItemPoolEntry" ADD CONSTRAINT "WheelPoolEntry_quantity_bounds" CHECK ("minimumQuantity" >= 1 AND "maximumQuantity" >= "minimumQuantity");
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "DailyWheelSpin" ADD CONSTRAINT "DailyWheelSpin_coins_nonnegative" CHECK ("awardedCoins" >= 0);
ALTER TABLE "DailyFoodPoolEntry" ADD CONSTRAINT "FoodPoolEntry_weight_positive" CHECK ("selectionWeight" > 0);
ALTER TABLE "DailyFoodPoolEntry" ADD CONSTRAINT "FoodPoolEntry_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "DailyFoodClaim" ADD CONSTRAINT "DailyFoodClaim_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "DailyFoodClaim" ADD CONSTRAINT "DailyFoodClaim_quantity_positive" CHECK ("awardedQuantity" >= 1);

-- Request boards (Phase 7).
ALTER TABLE "RequestBoard" ADD CONSTRAINT "RequestBoard_daily_limit_positive" CHECK ("dailyCompletionLimit" >= 1);
ALTER TABLE "RequestDefinition" ADD CONSTRAINT "RequestDefinition_reward_positive" CHECK ("rewardCoins" > 0);
ALTER TABLE "RequestDefinition" ADD CONSTRAINT "RequestDefinition_position_nonnegative" CHECK ("sequencePosition" >= 0);
ALTER TABLE "RequestRequirement" ADD CONSTRAINT "RequestRequirement_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "PlayerRequestBoardProgress" ADD CONSTRAINT "RequestProgress_completed_nonnegative" CHECK ("totalCompleted" >= 0);
ALTER TABLE "PlayerRequestBoardProgress" ADD CONSTRAINT "RequestProgress_version_nonnegative" CHECK ("stateVersion" >= 0);
ALTER TABLE "RequestCompletion" ADD CONSTRAINT "RequestCompletion_ordinal_positive" CHECK ("completionOrdinal" >= 1);
ALTER TABLE "RequestCompletion" ADD CONSTRAINT "RequestCompletion_reward_nonnegative" CHECK ("rewardCoins" >= 0);
ALTER TABLE "RequestCompletion" ADD CONSTRAINT "RequestCompletion_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- Location activity display order is non-negative.
ALTER TABLE "LocationActivity" ADD CONSTRAINT "LocationActivity_order_nonnegative" CHECK ("displayOrder" >= 0);


-- Random events: rewards are never negative and the counter only grows.
ALTER TABLE "RandomEventOccurrence" ADD CONSTRAINT "RandomEvent_coins_nonnegative" CHECK ("coinsAwarded" >= 0);

-- Foraging: a spot must be drawable, and a find must agree with itself
-- about whether anything was found.
ALTER TABLE "ForageSpot" ADD CONSTRAINT "ForageSpot_daily_limit_positive" CHECK ("dailyLimit" > 0);
ALTER TABLE "ForageSpot" ADD CONSTRAINT "ForageSpot_nothing_weight_nonnegative" CHECK ("nothingWeight" >= 0);
ALTER TABLE "ForageSpotEntry" ADD CONSTRAINT "ForageSpotEntry_weight_positive" CHECK ("selectionWeight" > 0);
ALTER TABLE "ForageSpotEntry" ADD CONSTRAINT "ForageSpotEntry_quantity_bounds" CHECK ("minQuantity" >= 1 AND "maxQuantity" >= "minQuantity");
ALTER TABLE "ForageFind" ADD CONSTRAINT "ForageFind_ordinal_positive" CHECK ("searchOrdinal" > 0);
ALTER TABLE "ForageFind" ADD CONSTRAINT "ForageFind_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
-- An empty-handed search carries no item and no quantity; a find carries
-- both. Neither half can drift from the other.
ALTER TABLE "ForageFind" ADD CONSTRAINT "ForageFind_item_quantity_agree" CHECK (("itemId" IS NULL AND "quantity" = 0) OR ("itemId" IS NOT NULL AND "quantity" > 0));
ALTER TABLE "RandomEventOccurrence" ADD CONSTRAINT "RandomEventOccurrence_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- Sorting Bench: a run's derived numbers can never go backwards, and one
-- live run per player is what stops a board being forked.
ALTER TABLE "SortingRun" ADD CONSTRAINT "SortingRun_draw_index_nonnegative" CHECK ("drawIndex" >= 0);
ALTER TABLE "SortingRun" ADD CONSTRAINT "SortingRun_score_nonnegative" CHECK ("score" >= 0);
ALTER TABLE "SortingRun" ADD CONSTRAINT "SortingRun_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
CREATE UNIQUE INDEX "SortingRun_one_live_per_user" ON "SortingRun"("userId") WHERE "status" = 'IN_PROGRESS';
ALTER TABLE "SortingDailyBest" ADD CONSTRAINT "SortingDailyBest_score_nonnegative" CHECK ("bestScore" >= 0);
ALTER TABLE "SortingDailyBest" ADD CONSTRAINT "SortingDailyBest_paid_nonnegative" CHECK ("coinsPaid" >= 0);
ALTER TABLE "SortingDailyBest" ADD CONSTRAINT "SortingDailyBest_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "SortingPayout" ADD CONSTRAINT "SortingPayout_coins_positive" CHECK ("coins" > 0);

-- The Hollow: geometry stays inside the frame, prices are never negative,
-- and a growing furnishing that finishes in zero days is a content bug.
ALTER TABLE "HollowAnchorDefinition" ADD CONSTRAINT "HollowAnchor_within_frame" CHECK ("x" >= 0 AND "x" <= 100 AND "y" >= 0 AND "y" <= 100);
ALTER TABLE "HollowAnchorDefinition" ADD CONSTRAINT "HollowAnchor_depth_nonnegative" CHECK ("depth" >= 0);
ALTER TABLE "HollowGroundPrice" ADD CONSTRAINT "HollowGroundPrice_nonnegative" CHECK ("price" >= 0 AND "heldCount" >= 0);
ALTER TABLE "HollowAirDefinition" ADD CONSTRAINT "HollowAir_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "HollowScene" ADD CONSTRAINT "HollowScene_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "Furnishing" ADD CONSTRAINT "Furnishing_growth_positive" CHECK ("growthDays" IS NULL OR "growthDays" > 0);

-- The Leaving Shelf: a lot can never hand out more than was put on it, and
-- the two counters can never disagree about how much is left.
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_remaining_bounds" CHECK ("remaining" >= 0 AND "remaining" <= "quantity");
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_ordinal_positive" CHECK ("donationOrdinal" > 0);
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
-- Expiry is set once at creation and never extended. A lot that expires
-- before it was left is a clock bug, and it would be invisible otherwise.
ALTER TABLE "GiveawayOffering" ADD CONSTRAINT "GiveawayOffering_expires_after_offered" CHECK ("expiresAt" > "offeredAt");
ALTER TABLE "GiveawayTake" ADD CONSTRAINT "GiveawayTake_ordinal_positive" CHECK ("takeOrdinal" > 0);
ALTER TABLE "GiveawayTake" ADD CONSTRAINT "GiveawayTake_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');

-- The Tumblehouse drums (ADR-49). Same discipline as the chits: a weight
-- over the full 10000 basis points cannot be part of a valid table, and
-- the exact per-tier sum is checked offline where the whole table is
-- visible at once.
ALTER TABLE "SpinToken" ADD CONSTRAINT "SpinToken_tier_bounds" CHECK ("tier" >= 1 AND "tier" <= 5);
-- Three drums need at least three faces to be able to disagree, and the
-- symbol table is what caps the top.
ALTER TABLE "SpinToken" ADD CONSTRAINT "SpinToken_faces_bounds" CHECK ("faces" >= 3 AND "faces" <= 12);
ALTER TABLE "SlotPrize" ADD CONSTRAINT "SlotPrize_weight_range" CHECK ("weight" >= 1 AND "weight" <= 10000);
ALTER TABLE "SlotPrize" ADD CONSTRAINT "SlotPrize_quantity_positive" CHECK ("quantity" >= 1);
-- Exactly one payload per outcome, and none at all for a loss.
ALTER TABLE "SlotPrize" ADD CONSTRAINT "SlotPrize_one_payload" CHECK (
  ("kind" = 'NOTHING' AND "coinAmount" IS NULL AND "prizeItemId" IS NULL)
  OR ("kind" = 'COINS' AND "coinAmount" IS NOT NULL AND "coinAmount" > 0 AND "prizeItemId" IS NULL)
  OR ("kind" = 'ITEM' AND "prizeItemId" IS NOT NULL AND "coinAmount" IS NULL)
);
-- A winner names the face the drums show three of; a loser cannot, since
-- there is no such face. The reel dressing reads this column, so the two
-- halves of "what was won" and "what is shown" cannot drift apart.
ALTER TABLE "SlotPrize" ADD CONSTRAINT "SlotPrize_face_matches_kind" CHECK (
  ("kind" = 'NOTHING' AND "faceIndex" IS NULL)
  OR ("kind" <> 'NOTHING' AND "faceIndex" IS NOT NULL AND "faceIndex" >= 0)
);
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_coins_nonnegative" CHECK ("awardedCoins" >= 0);
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_quantity_nonnegative" CHECK ("quantity" >= 0);
-- Three drums, recorded as three face indices, or nothing yet.
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_reels_shape" CHECK ("reels" = '' OR "reels" ~ '^[0-9a-f]{3}$');

-- The Morning Slate (ADR-51). A grid is 81 cells whether it is the puzzle,
-- the solution, or somebody's half-finished working, and a row that is not
-- 81 cells long would break every index into it downstream.
ALTER TABLE "SudokuPuzzle" ADD CONSTRAINT "SudokuPuzzle_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "SudokuPuzzle" ADD CONSTRAINT "SudokuPuzzle_givens_shape" CHECK ("givens" ~ '^[1-9.]{81}$');
ALTER TABLE "SudokuPuzzle" ADD CONSTRAINT "SudokuPuzzle_solution_shape" CHECK ("solution" ~ '^[1-9]{81}$');
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_gameDate_format" CHECK ("gameDate" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_entries_shape" CHECK ("entries" ~ '^[1-9.]{81}$');
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_checks_nonnegative" CHECK ("wrongChecks" >= 0);
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_coins_nonnegative" CHECK ("coins" >= 0);
-- A solve time is only meaningful on a solved grid, and vice versa. The
-- time itself may be UNKNOWN on a solve: a player who worked the grid in
-- the browser and spoke to the server exactly once has no elapsed time to
-- measure, and recording 0 would stand as a personal best nothing could
-- ever beat. Null means "not known", not "instant".
ALTER TABLE "SudokuAttempt" ADD CONSTRAINT "SudokuAttempt_solved_agrees" CHECK (
  ("status" = 'SOLVED' AND "solvedAt" IS NOT NULL AND ("solveSeconds" IS NULL OR "solveSeconds" >= 0))
  OR ("status" <> 'SOLVED' AND "solvedAt" IS NULL AND "solveSeconds" IS NULL)
);

-- Reading (ADR-50). Insight only ever accumulates, and a shelf row that
-- claims zero readings is a row that should not exist.
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_insight_nonnegative" CHECK ("insight" >= 0);
ALTER TABLE "PetBookReading" ADD CONSTRAINT "PetBookReading_times_positive" CHECK ("timesRead" >= 1);
ALTER TABLE "PetBookReading" ADD CONSTRAINT "PetBookReading_insight_nonnegative" CHECK ("insightGiven" >= 0);
ALTER TABLE "PetBookReading" ADD CONSTRAINT "PetBookReading_last_after_first" CHECK ("lastReadAt" >= "firstReadAt");
ALTER TABLE "Book" ADD CONSTRAINT "Book_insight_positive" CHECK ("insight" > 0);

-- The Sunken Stair (ADR-59). The descent is a fixed depth, the choices
-- string is one character per section answered, and being turned back
-- never takes coins back — so what is found only ever goes up.
ALTER TABLE "CaveSection" ADD CONSTRAINT "CaveSection_index_bounds" CHECK ("sectionIndex" >= 1 AND "sectionIndex" <= 10);
ALTER TABLE "CaveSection" ADD CONSTRAINT "CaveSection_doors_differ" CHECK ("doorOne" <> "doorTwo");
ALTER TABLE "CaveHoardEntry" ADD CONSTRAINT "CaveHoardEntry_weight_positive" CHECK ("selectionWeight" > 0);
ALTER TABLE "CaveDelve" ADD CONSTRAINT "CaveDelve_coins_nonnegative" CHECK ("coinsEarned" >= 0);
ALTER TABLE "CaveDelve" ADD CONSTRAINT "CaveDelve_choices_shape" CHECK ("choices" ~ '^[01]{0,10}$');
-- A prize only exists at the bottom, and the bottom is only reachable by
-- answering every section. Anything else is a row that says a player was
-- handed the hoard without walking to it.
ALTER TABLE "CaveDelve" ADD CONSTRAINT "CaveDelve_prize_implies_cleared" CHECK (
  "prizeItemId" IS NULL OR ("status" = 'CLEARED' AND length("choices") = 10)
);
ALTER TABLE "CaveDelve" ADD CONSTRAINT "CaveDelve_ended_agrees" CHECK (
  ("status" = 'IN_PROGRESS' AND "endedAt" IS NULL)
  OR ("status" <> 'IN_PROGRESS' AND "endedAt" IS NOT NULL)
);

-- Pet care: ailments, coat, bond (ADR-60). Every one of these encodes a
-- product rule rather than a nicety: an ailment always ends, a bond never
-- falls, and nothing here can push a stat outside 0-100.
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_coat_bounds" CHECK ("coat" >= 0 AND "coat" <= 100);
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_bond_nonnegative" CHECK ("bond" >= 0);
-- Three days is the outside limit, and it is a product rule rather than an
-- authoring preference: an ailment a player cannot simply outwait is one
-- they have to pay to remove. The content schema says the same thing, but
-- the database is where the claim has to hold — a kind written straight
-- into the table by a script would otherwise sidestep it.
ALTER TABLE "AilmentKind" ADD CONSTRAINT "AilmentKind_rest_bounds" CHECK ("restHours" > 0 AND "restHours" <= 72);
ALTER TABLE "AilmentKind" ADD CONSTRAINT "AilmentKind_drag_bounds" CHECK ("happinessDrag" >= 0 AND "happinessDrag" <= 10);
ALTER TABLE "AilmentKind" ADD CONSTRAINT "AilmentKind_cap_bounds" CHECK ("healthCap" >= 20 AND "healthCap" <= 100);
-- An ailment must always have an end. A row with restsAt at or before its
-- start would be one that never passes on its own, which is the single
-- shape this feature must never take.
ALTER TABLE "PetAilment" ADD CONSTRAINT "PetAilment_rests_after_start" CHECK ("restsAt" > "startedAt");
ALTER TABLE "PetAilment" ADD CONSTRAINT "PetAilment_treated_agrees" CHECK (
  ("treatedAt" IS NULL AND "remedyItemId" IS NULL)
  OR ("treatedAt" IS NOT NULL AND "remedyItemId" IS NOT NULL)
);
ALTER TABLE "Remedy" ADD CONSTRAINT "Remedy_comfort_bounds" CHECK ("comfort" >= 0 AND "comfort" <= 50);
ALTER TABLE "Item" ADD CONSTRAINT "Item_coat_care_positive" CHECK ("coatCare" IS NULL OR "coatCare" > 0);

-- The arcade games (ADR-62). Three claims a day is a product rule, so the
-- database says so too: the unique constraint on (user, day, game, index)
-- stops a fourth from being inserted, and this stops an index outside the
-- range from being invented to get around it.
ALTER TABLE "ArcadePayout" ADD CONSTRAINT "ArcadePayout_claim_index_bounds" CHECK ("claimIndex" >= 1 AND "claimIndex" <= 3);
-- A payout is for a score that was actually reached, and coins are never
-- negative. Both of these are derived server-side and neither should ever
-- be able to go the other way, which is exactly when a CHECK earns its
-- keep — the day somebody refactors the replay.
ALTER TABLE "ArcadePayout" ADD CONSTRAINT "ArcadePayout_nonnegative" CHECK ("score" >= 0 AND "coins" >= 0);
ALTER TABLE "ArcadeRun" ADD CONSTRAINT "ArcadeRun_nonnegative" CHECK ("score" >= 0 AND "ticks" >= 0);

-- The Shrine's counter only ever goes up, and a negative reading would be
-- a bug wearing a joke's clothes: the odometer pads to six digits, so a
-- negative would render as "00-1" and look deliberate.
ALTER TABLE "Shrine" ADD CONSTRAINT "Shrine_visits_nonnegative" CHECK ("visits" >= 0);
