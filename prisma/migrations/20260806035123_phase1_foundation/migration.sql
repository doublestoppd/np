-- AlterTable
-- artKey is added nullable, backfilled from the stable slug for existing
-- rows (seeded databases are never empty), then made NOT NULL. Hand-edited;
-- see docs/architecture-decisions.md ADR-2.
ALTER TABLE "Item" ADD COLUMN     "artKey" TEXT,
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "tradeable" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "type" DROP NOT NULL;

UPDATE "Item" SET "artKey" = "slug" WHERE "artKey" IS NULL;

ALTER TABLE "Item" ALTER COLUMN "artKey" SET NOT NULL;

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
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowcaseEntry_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "artKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,

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

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ItemToItemTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ItemToItemTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "ShowcaseEntry_userId_position_idx" ON "ShowcaseEntry"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ShowcaseEntry_userId_itemId_key" ON "ShowcaseEntry"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategory_slug_key" ON "ItemCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ItemTag_slug_key" ON "ItemTag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Region_slug_key" ON "Region"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE INDEX "Location_regionId_idx" ON "Location"("regionId");

-- CreateIndex
CREATE INDEX "_ItemToItemTag_B_index" ON "_ItemToItemTag"("B");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_featuredPetId_fkey" FOREIGN KEY ("featuredPetId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToItemTag" ADD CONSTRAINT "_ItemToItemTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ItemToItemTag" ADD CONSTRAINT "_ItemToItemTag_B_fkey" FOREIGN KEY ("B") REFERENCES "ItemTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Database-level safeguards (hand-written; Prisma does not model CHECK
-- constraints — see docs/architecture-decisions.md ADR-2). Covered by
-- integration tests in src/server/services/item-integrity.test.ts.
ALTER TABLE "InventoryEntry" ADD CONSTRAINT "InventoryEntry_quantity_nonnegative" CHECK ("quantity" >= 0);
ALTER TABLE "Item" ADD CONSTRAINT "Item_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_position_nonnegative" CHECK ("position" >= 0);
