-- Phase 3: architecture stabilization. Hand-edited migration with data
-- backfills (see docs/architecture-decisions.md and docs/conventions.md).
--
-- RECOVERY / ROLLBACK NOTES
-- * BIGINT conversions are value-preserving and reversible ONLY while all
--   values still fit INT4; after that, restoring an INT4 schema requires a
--   backup. Take a backup before deploying.
-- * normalizedUsername backfill suffixes casing collisions (_2, _3...) and
--   records a SecurityEvent per affected account; no account is dropped.
-- * Item.active -> lifecycle and intervalHours -> intervalMinutes are
--   value-preserving rewrites; the JSON->relational provenance backfill
--   preserves every event (verify counts post-deploy; the reconciliation
--   script cross-checks instances vs. events).
-- * StarterClaim backfill marks each user's oldest pet as their starter.
-- * All other changes are additive. Roll forward on failure; restore from
--   backup for a true rollback.

-- CreateEnum
CREATE TYPE "ItemLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED', 'DISABLED');

-- DropIndex
DROP INDEX "Location_slug_key";

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "lifecycle" "ItemLifecycle" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "price" SET DATA TYPE BIGINT;
UPDATE "Item" SET "lifecycle" = 'DISABLED' WHERE "active" = false;
ALTER TABLE "Item" DROP COLUMN "active";

-- AlterTable
-- Migrate mutable JSON provenance into append-only relational events
-- before dropping the column (created after the events table below).
-- (moved below CreateTable "ItemProvenanceEvent")

-- AlterTable
ALTER TABLE "NpcShopPoolEntry" ALTER COLUMN "price" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "NpcShopRestockConfig"
ADD COLUMN     "anchorAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00'::timestamp,
ADD COLUMN     "intervalMinutes" INTEGER NOT NULL DEFAULT 480;
UPDATE "NpcShopRestockConfig" SET "intervalMinutes" = "intervalHours" * 60;
ALTER TABLE "NpcShopRestockConfig" DROP COLUMN "intervalHours";

-- AlterTable
ALTER TABLE "NpcShopStock" ALTER COLUMN "price" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "PlayerShop" ALTER COLUMN "unclaimedProceeds" SET DATA TYPE BIGINT,
ALTER COLUMN "lifetimeRevenue" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "PlayerShopListing" ALTER COLUMN "unitPrice" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "PlayerShopUpgradeTier" ALTER COLUMN "price" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "ShopRestock" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ShowcaseEntry" ADD COLUMN     "itemInstanceId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "coinsDelta" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "normalizedUsername" TEXT,
ALTER COLUMN "coins" SET DATA TYPE BIGINT;
-- Backfill canonical identities; resolve casing/whitespace collisions by
-- suffixing later registrations (collisions are logged into SecurityEvent
-- for operator follow-up rather than dropping any account).
UPDATE "User" SET "normalizedUsername" = lower(btrim("username"));
WITH ranked AS (
  SELECT id, "normalizedUsername",
         row_number() OVER (PARTITION BY "normalizedUsername" ORDER BY "createdAt", id) AS rn
  FROM "User"
)
UPDATE "User" u
SET "normalizedUsername" = u."normalizedUsername" || '_' || r.rn
FROM ranked r
WHERE u.id = r.id AND r.rn > 1;
INSERT INTO "SecurityEvent" (id, "userId", type, severity, message, "createdAt")
SELECT gen_random_uuid()::text, u.id, 'username-normalization-collision', 'warning',
       'Username collided under normalization; suffixed to ' || u."normalizedUsername", CURRENT_TIMESTAMP
FROM "User" u WHERE u."normalizedUsername" ~ '_[0-9]+$' AND EXISTS (
  SELECT 1 FROM "User" v WHERE v.id <> u.id
    AND lower(btrim(v."username")) = lower(btrim(u."username")));
ALTER TABLE "User" ALTER COLUMN "normalizedUsername" SET NOT NULL;

-- CreateTable
CREATE TABLE "StarterClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarterClaim_pkey" PRIMARY KEY ("id")
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

-- Backfill: JSON provenance arrays -> relational events, then drop the JSON.
INSERT INTO "ItemProvenanceEvent"
  (id, "itemInstanceId", "eventType", "sourceType", metadata, "createdAt")
SELECT gen_random_uuid()::text,
       i.id,
       COALESCE(e.elem->>'type', 'created'),
       i."acquisitionSource",
       jsonb_build_object('note', e.elem->>'note'),
       COALESCE((e.elem->>'at')::timestamptz, i."createdAt")
FROM "ItemInstance" i,
LATERAL jsonb_array_elements(i.provenance::jsonb) WITH ORDINALITY AS e(elem, ord)
WHERE jsonb_typeof(i.provenance::jsonb) = 'array';
ALTER TABLE "ItemInstance" DROP COLUMN "provenance";

-- Backfill: a StarterClaim for each user's oldest pet, so the starter
-- invariant holds for accounts created before this migration.
INSERT INTO "StarterClaim" (id, "userId", "petId", "claimedAt")
SELECT gen_random_uuid()::text, p."ownerId", p.id, p."createdAt"
FROM "Pet" p
JOIN (SELECT "ownerId", min("createdAt") AS first FROM "Pet" GROUP BY "ownerId") o
  ON o."ownerId" = p."ownerId" AND o.first = p."createdAt"
ON CONFLICT DO NOTHING;


-- CreateIndex
CREATE UNIQUE INDEX "StarterClaim_userId_key" ON "StarterClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StarterClaim_petId_key" ON "StarterClaim"("petId");

-- CreateIndex
CREATE INDEX "ItemProvenanceEvent_itemInstanceId_createdAt_idx" ON "ItemProvenanceEvent"("itemInstanceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Location_regionId_slug_key" ON "Location"("regionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_normalizedUsername_key" ON "User"("normalizedUsername");

-- AddForeignKey
ALTER TABLE "StarterClaim" ADD CONSTRAINT "StarterClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterClaim" ADD CONSTRAINT "StarterClaim_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowcaseEntry" ADD CONSTRAINT "ShowcaseEntry_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "ItemInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_itemInstanceId_fkey" FOREIGN KEY ("itemInstanceId") REFERENCES "ItemInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemProvenanceEvent" ADD CONSTRAINT "ItemProvenanceEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Phase 3 database-level safeguards.
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_interval_positive" CHECK ("intervalMinutes" > 0);
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_target_positive" CHECK ("targetListings" > 0);
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_tier_bounds" CHECK (
  "commonMin" >= 0 AND "commonMax" >= "commonMin" AND
  "uncommonMin" >= 0 AND "uncommonMax" >= "uncommonMin" AND
  "rareMin" >= 0 AND "rareMax" >= "rareMin" AND
  "maxUltraRare" >= 0
);
ALTER TABLE "NpcShopRestockConfig" ADD CONSTRAINT "RestockConfig_bps_range" CHECK ("ultraRareBps" >= 0 AND "ultraRareBps" <= 10000);
ALTER TABLE "PlayerShopUpgradeTier" ADD CONSTRAINT "UpgradeTier_price_positive" CHECK ("price" > 0);
ALTER TABLE "PlayerShopUpgradeTier" ADD CONSTRAINT "UpgradeTier_bonus_positive" CHECK ("capacityBonus" > 0);
ALTER TABLE "NpcShopStock" ADD CONSTRAINT "NpcShopStock_initial_gte_remaining" CHECK ("initialQuantity" >= "quantity");
-- Items requiring per-copy provenance must be instanced.
ALTER TABLE "Item" ADD CONSTRAINT "Item_provenance_requires_instances" CHECK ("provenancePolicy" = 'NONE' OR "stackable" = false);
