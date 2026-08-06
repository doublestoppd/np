-- Phase 2: world navigation metadata, generalized items + instances,
-- economy ledger extensions, NPC shops + weighted restocking, player shops
-- with escrow/proceeds/capacity upgrades, idempotency, rate limiting, and
-- security events. Hand-edited (see docs/architecture-decisions.md):
-- backfill-safe updatedAt additions, CHECK constraints, and a partial
-- unique index, none of which Prisma models natively.
--
-- RECOVERY / ROLLBACK NOTES
-- * This migration DROPS the Phase-0 "Shop" and "ShopListing" tables. They
--   held seed-only content (1 shop, 11 listings) with no UI or service
--   usage; recovery is re-running the pre-phase-2 seed on a pre-phase-2
--   schema. No player data is affected.
-- * All other changes are additive (new tables/columns/enum values with
--   defaults). Enum value additions cannot be rolled back in place in
--   PostgreSQL; roll forward, or restore from a database backup taken
--   before deploy (recommended for production).
-- * Foreign keys from ledger tables use RESTRICT so cascading deletes can
--   never destroy economic history; account deletion therefore requires an
--   explicit administrative archival procedure (docs/operations.md).

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'ULTRA_RARE');

-- CreateEnum
CREATE TYPE "ProvenancePolicy" AS ENUM ('NONE', 'ORIGINAL_SOURCE', 'FULL_HISTORY');

-- CreateEnum
CREATE TYPE "ItemInstanceStatus" AS ENUM ('OWNED', 'ESCROWED', 'RETIRED');

-- CreateEnum
CREATE TYPE "RestockStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "NpcStockStatus" AS ENUM ('ACTIVE', 'SOLD_OUT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlayerListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'DISABLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'NPC_PURCHASE';
ALTER TYPE "TransactionType" ADD VALUE 'PLAYER_LISTING_CREATE';
ALTER TYPE "TransactionType" ADD VALUE 'PLAYER_LISTING_CANCEL';
ALTER TYPE "TransactionType" ADD VALUE 'PLAYER_SALE';
ALTER TYPE "TransactionType" ADD VALUE 'PLAYER_PURCHASE';
ALTER TYPE "TransactionType" ADD VALUE 'PROCEEDS_CLAIM';
ALTER TYPE "TransactionType" ADD VALUE 'CAPACITY_UPGRADE';
ALTER TYPE "TransactionType" ADD VALUE 'ADMIN_ADJUST';

-- DropForeignKey
ALTER TABLE "ShopListing" DROP CONSTRAINT "ShopListing_itemId_fkey";

-- DropForeignKey
ALTER TABLE "ShopListing" DROP CONSTRAINT "ShopListing_shopId_fkey";

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_userId_fkey";

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "provenancePolicy" "ProvenancePolicy" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "rarity" "Rarity" NOT NULL DEFAULT 'COMMON',
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "retiredAt" TIMESTAMP(3),
ADD COLUMN     "stackable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Item" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "mapX" INTEGER,
ADD COLUMN     "mapY" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Location" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Region" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Region" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "counterpartyUserId" TEXT,
ADD COLUMN     "itemInstanceId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "npcStockId" TEXT,
ADD COLUMN     "playerListingId" TEXT,
ADD COLUMN     "restockId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commerceDisabledAt" TIMESTAMP(3),
ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "Shop";

-- DropTable
DROP TABLE "ShopListing";

-- CreateTable
CREATE TABLE "ItemInstance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "ItemInstanceStatus" NOT NULL DEFAULT 'OWNED',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquisitionSource" TEXT NOT NULL,
    "provenance" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemInstance_pkey" PRIMARY KEY ("id")
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
    "artKey" TEXT,
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
    "price" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "availableFrom" TIMESTAMP(3),
    "availableUntil" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "NpcShopPoolEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpcShopRestockConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "intervalHours" INTEGER NOT NULL DEFAULT 8,
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
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    "price" INTEGER NOT NULL,
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
    "unclaimedProceeds" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRevenue" INTEGER NOT NULL DEFAULT 0,
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
    "unitPrice" INTEGER NOT NULL,
    "status" "PlayerListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "buyerId" TEXT,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerShopListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerShopUpgradeTier" (
    "id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
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

-- CreateIndex
CREATE INDEX "ItemInstance_ownerId_status_idx" ON "ItemInstance"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ItemInstance_itemId_idx" ON "ItemInstance"("itemId");

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
CREATE INDEX "ShopRestock_shopId_generatedAt_idx" ON "ShopRestock"("shopId", "generatedAt");

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
CREATE INDEX "Transaction_itemId_createdAt_idx" ON "Transaction"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_playerListingId_idx" ON "Transaction"("playerListingId");

-- CreateIndex
CREATE INDEX "Transaction_restockId_idx" ON "Transaction"("restockId");

-- CreateIndex
CREATE INDEX "Transaction_type_createdAt_idx" ON "Transaction"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "ItemInstance" ADD CONSTRAINT "ItemInstance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemInstance" ADD CONSTRAINT "ItemInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopUpgradePurchase" ADD CONSTRAINT "PlayerShopUpgradePurchase_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "PlayerShop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerShopUpgradePurchase" ADD CONSTRAINT "PlayerShopUpgradePurchase_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "PlayerShopUpgradeTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_counterpartyUserId_fkey" FOREIGN KEY ("counterpartyUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "ItemInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_npcStockId_fkey" FOREIGN KEY ("npcStockId") REFERENCES "NpcShopStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_playerListingId_fkey" FOREIGN KEY ("playerListingId") REFERENCES "PlayerShopListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_restockId_fkey" FOREIGN KEY ("restockId") REFERENCES "ShopRestock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Database-level safeguards (hand-written; covered by integration tests).
ALTER TABLE "User" ADD CONSTRAINT "User_coins_nonnegative" CHECK ("coins" >= 0);
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_weight_positive" CHECK ("weight" > 0);
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "NpcShopPoolEntry" ADD CONSTRAINT "NpcShopPoolEntry_quantity_bounds" CHECK ("minQuantity" >= 1 AND "maxQuantity" >= "minQuantity");
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_proceeds_nonnegative" CHECK ("unclaimedProceeds" >= 0);
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_revenue_nonnegative" CHECK ("lifetimeRevenue" >= 0);
ALTER TABLE "PlayerShop" ADD CONSTRAINT "PlayerShop_capacity_nonnegative" CHECK ("listingCapacity" >= 0);
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_price_positive" CHECK ("unitPrice" >= 1);
ALTER TABLE "PlayerShopListing" ADD CONSTRAINT "PlayerShopListing_quantity_positive" CHECK ("quantity" >= 1);
ALTER TABLE "Location" ADD CONSTRAINT "Location_map_position_bounds" CHECK (
  ("mapX" IS NULL OR ("mapX" >= 0 AND "mapX" <= 100)) AND
  ("mapY" IS NULL OR ("mapY" >= 0 AND "mapY" <= 100))
);

-- An item instance may back at most one ACTIVE listing (partial unique
-- index; resale after SOLD/CANCELLED creates a new listing row).
CREATE UNIQUE INDEX "PlayerShopListing_active_instance_key"
  ON "PlayerShopListing"("itemInstanceId")
  WHERE "status" = 'ACTIVE' AND "itemInstanceId" IS NOT NULL;
