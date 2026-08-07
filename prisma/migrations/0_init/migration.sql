-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('FOOD', 'TOY');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'ULTRA_RARE');

-- CreateEnum
CREATE TYPE "ItemLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProvenancePolicy" AS ENUM ('NONE', 'ORIGINAL_SOURCE', 'FULL_HISTORY');

-- CreateEnum
CREATE TYPE "ItemInstanceStatus" AS ENUM ('OWNED', 'ESCROWED');

-- CreateEnum
CREATE TYPE "LocationActivityType" AS ENUM ('NPC_SHOP', 'DAILY_WORD', 'DAILY_WHEEL', 'DAILY_MEAL', 'REQUEST_BOARD', 'FORAGING');

-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NpcStockStatus" AS ENUM ('ACTIVE', 'SOLD_OUT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlayerListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('STARTER_GRANT', 'ITEM_USE', 'NPC_PURCHASE', 'PLAYER_LISTING_CREATE', 'PLAYER_LISTING_REPRICE', 'PLAYER_LISTING_CANCEL', 'PLAYER_SALE', 'PLAYER_PURCHASE', 'PROCEEDS_CLAIM', 'CAPACITY_UPGRADE', 'ADMIN_ADJUST', 'DAILY_WORD_REWARD', 'DAILY_WHEEL_PRIZE', 'DAILY_FOOD_CLAIM', 'REQUEST_REWARD', 'FORAGE_FIND', 'RANDOM_EVENT');

-- CreateEnum
CREATE TYPE "WordDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "DailyWordStatus" AS ENUM ('IN_PROGRESS', 'SOLVED', 'FAILED');

-- CreateEnum
CREATE TYPE "WheelResultType" AS ENUM ('COINS', 'ITEM_POOL', 'NOTHING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "normalizedUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "coins" BIGINT NOT NULL DEFAULT 200,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "commerceDisabledAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "statsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pet_pkey" PRIMARY KEY ("id")
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
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PetSpecies_slug_key" ON "PetSpecies"("slug");

-- CreateIndex
CREATE INDEX "Pet_ownerId_idx" ON "Pet"("ownerId");

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
CREATE UNIQUE INDEX "DailyWordPuzzle_gameDate_difficulty_key" ON "DailyWordPuzzle"("gameDate", "difficulty");

-- CreateIndex
CREATE INDEX "DailyWordResult_userId_createdAt_idx" ON "DailyWordResult"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DailyWordResult_puzzleId_status_idx" ON "DailyWordResult"("puzzleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordResult_userId_puzzleId_key" ON "DailyWordResult"("userId", "puzzleId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWordGuess_resultId_guessNumber_key" ON "DailyWordGuess"("resultId", "guessNumber");

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
CREATE UNIQUE INDEX "DailyFoodClaim_userId_gameDate_key" ON "DailyFoodClaim"("userId", "gameDate");

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
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "PetSpecies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetToyUse" ADD CONSTRAINT "PetToyUse_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PetToyUse" ADD CONSTRAINT "PetToyUse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "DailyWordResult" ADD CONSTRAINT "DailyWordResult_attempts_bounds" CHECK ("attemptsUsed" >= 0 AND "attemptsUsed" <= 5);
ALTER TABLE "DailyWordResult" ADD CONSTRAINT "DailyWordResult_reward_nonnegative" CHECK ("rewardCoins" >= 0);
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
