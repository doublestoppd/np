-- CreateEnum
CREATE TYPE "WordDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "DailyWordStatus" AS ENUM ('IN_PROGRESS', 'SOLVED', 'FAILED');

-- CreateEnum
CREATE TYPE "WheelResultType" AS ENUM ('COINS', 'ITEM_POOL', 'NOTHING');

-- CreateEnum
CREATE TYPE "WheelPoolType" AS ENUM ('COMMON', 'RARE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'DAILY_WORD_REWARD';
ALTER TYPE "TransactionType" ADD VALUE 'DAILY_WHEEL_PRIZE';
ALTER TYPE "TransactionType" ADD VALUE 'DAILY_FOOD_CLAIM';

-- CreateTable
CREATE TABLE "WordEntry" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "acceptedAsGuess" BOOLEAN NOT NULL DEFAULT true,
    "eligibleAsAnswer" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contentNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWordPuzzle" (
    "id" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "difficulty" "WordDifficulty" NOT NULL,
    "answerWordId" TEXT NOT NULL,
    "rewardCoins" BIGINT NOT NULL,
    "generationVersion" INTEGER NOT NULL,
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
    "activeFromGameDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyWheelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWheelPrize" (
    "id" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
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
    "poolType" "WheelPoolType" NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "WordEntry_word_key" ON "WordEntry"("word");

-- CreateIndex
CREATE INDEX "WordEntry_length_eligibleAsAnswer_active_idx" ON "WordEntry"("length", "eligibleAsAnswer", "active");

-- CreateIndex
CREATE INDEX "DailyWordPuzzle_gameDate_idx" ON "DailyWordPuzzle"("gameDate");

-- CreateIndex
CREATE INDEX "DailyWordPuzzle_answerWordId_gameDate_idx" ON "DailyWordPuzzle"("answerWordId", "gameDate");

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

-- AddForeignKey
ALTER TABLE "DailyWordPuzzle" ADD CONSTRAINT "DailyWordPuzzle_answerWordId_fkey" FOREIGN KEY ("answerWordId") REFERENCES "WordEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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


-- ---------------------------------------------------------------------------
-- Hand-written safeguards (Prisma does not model CHECK constraints).
-- Additive migration: no backfills required. Recovery: the whole migration
-- is new-table DDL, so rolling back is dropping the Daily* / WordEntry
-- tables and the three new TransactionType values' rows.
-- ---------------------------------------------------------------------------
ALTER TABLE "WordEntry" ADD CONSTRAINT "WordEntry_length_bounds" CHECK ("length" >= 4 AND "length" <= 6);
ALTER TABLE "WordEntry" ADD CONSTRAINT "WordEntry_word_uppercase_ascii" CHECK ("word" ~ '^[A-Z]+$');
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
