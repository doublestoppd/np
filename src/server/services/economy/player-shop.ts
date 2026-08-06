import type { PlayerShop, PrismaClient } from "@prisma/client";
import { EconomyError } from "./errors";
import { withIdempotency, requestHash, type Tx } from "./idempotency";
import { enforceRateLimit } from "./rate-limit";
import { recordSecurityEvent } from "./audit";
import { creditCoins, debitCoins } from "./wallet";
import {
  escrowInstance,
  releaseInstance,
  removeItem,
  transferEscrowedInstance,
} from "./ownership";
import { assertCommerceAllowed } from "./npc-shop";
import {
  BASE_SHOP_CAPACITY,
  HIGH_VALUE_THRESHOLD,
  MAX_LISTING_QUANTITY,
  MAX_TRANSACTION_TOTAL,
  MAX_UNIT_PRICE,
} from "./config";

/**
 * Persistent fixed-price player shops (one per account) with listing
 * escrow, claimable proceeds, and content-configurable capacity upgrades.
 * No listing fees, no sales tax, no application-level price ceiling beyond
 * safe integer bounds, no auctions.
 */

function shopSlugFor(username: string): string {
  return username.toLowerCase();
}

/** Finds or lazily creates the user's shop (available from onboarding). */
export async function ensurePlayerShop(
  db: PrismaClient,
  userId: string,
): Promise<PlayerShop> {
  const existing = await db.playerShop.findUnique({ where: { ownerId: userId } });
  if (existing) {
    return existing;
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  return db.playerShop.upsert({
    where: { ownerId: userId },
    update: {},
    create: {
      ownerId: userId,
      slug: shopSlugFor(user.username),
      name: `${user.username}'s Stall`,
      description: "",
      listingCapacity: BASE_SHOP_CAPACITY,
    },
  });
}

export async function updateShopDetails(
  db: PrismaClient,
  {
    userId,
    name,
    description,
  }: { userId: string; name: string; description: string },
): Promise<void> {
  const shop = await ensurePlayerShop(db, userId);
  await db.playerShop.update({
    where: { id: shop.id },
    data: { name, description },
  });
}

function validateListingEconomics(quantity: number, unitPrice: number): void {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_LISTING_QUANTITY
  ) {
    throw new EconomyError("INVALID_QUANTITY");
  }
  if (!Number.isInteger(unitPrice) || unitPrice < 1 || unitPrice > MAX_UNIT_PRICE) {
    throw new EconomyError("INVALID_PRICE");
  }
  if (quantity * unitPrice > MAX_TRANSACTION_TOTAL) {
    throw new EconomyError("INVALID_PRICE");
  }
}

export interface ListingResult {
  [key: string]: string | number;
  listingId: string;
  itemSlug: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Creates an ACTIVE listing, moving the goods into escrow atomically:
 * stackable quantities leave ordinary inventory (the listing row is the
 * escrow); instances flip to ESCROWED. Capacity is enforced under a
 * per-shop advisory lock so concurrent creations cannot exceed it.
 */
export async function createListing(
  db: PrismaClient,
  {
    userId,
    itemId,
    itemInstanceId,
    quantity,
    unitPrice,
    idempotencyKey,
  }: {
    userId: string;
    itemId: string;
    itemInstanceId?: string | null;
    quantity: number;
    unitPrice: number;
    idempotencyKey: string;
  },
): Promise<ListingResult> {
  validateListingEconomics(quantity, unitPrice);
  await enforceRateLimit(db, "listing-mutation", userId);
  await assertCommerceAllowed(db, userId);
  const shop = await ensurePlayerShop(db, userId);
  if (!shop.active) {
    throw new EconomyError("SHOP_INACTIVE");
  }

  const { result } = await withIdempotency<ListingResult>(
    db,
    {
      userId,
      operation: "listing-create",
      key: idempotencyKey,
      requestHash: requestHash({ itemId, itemInstanceId, quantity, unitPrice }),
    },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pshop:" + shop.id}))`;

      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) {
        throw new EconomyError("ITEM_NOT_FOUND");
      }
      if (!item.active) {
        throw new EconomyError("ITEM_INACTIVE");
      }
      if (!item.tradeable) {
        throw new EconomyError("NOT_TRADEABLE");
      }

      const activeCount = await tx.playerShopListing.count({
        where: { shopId: shop.id, status: "ACTIVE" },
      });
      if (activeCount >= shop.listingCapacity) {
        throw new EconomyError("CAPACITY_FULL");
      }

      if (itemInstanceId) {
        if (quantity !== 1) {
          throw new EconomyError("INVALID_QUANTITY");
        }
        const instance = await tx.itemInstance.findUnique({
          where: { id: itemInstanceId },
        });
        if (!instance || instance.itemId !== itemId) {
          throw new EconomyError("INSTANCE_NOT_OWNED");
        }
        await escrowInstance(tx, { userId, instanceId: itemInstanceId });
      } else {
        if (!item.stackable) {
          throw new EconomyError("NOT_STACKABLE");
        }
        await removeItem(tx, { userId, itemId, quantity });
      }

      const listing = await tx.playerShopListing.create({
        data: {
          shopId: shop.id,
          sellerId: userId,
          itemId,
          itemInstanceId: itemInstanceId ?? null,
          quantity,
          unitPrice,
        },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "PLAYER_LISTING_CREATE",
          itemId,
          itemInstanceId: itemInstanceId ?? null,
          playerListingId: listing.id,
          quantity,
          note: `Listed ${quantity} × ${item.name} at ${unitPrice} coins each`,
        },
      });

      return {
        listingId: listing.id,
        itemSlug: item.slug,
        quantity,
        unitPrice,
      };
    },
  );
  return result;
}

/** Price changes are allowed while active; quantity changes are not. */
export async function updateListingPrice(
  db: PrismaClient,
  {
    userId,
    listingId,
    unitPrice,
  }: { userId: string; listingId: string; unitPrice: number },
): Promise<void> {
  await enforceRateLimit(db, "listing-mutation", userId);
  const listing = await db.playerShopListing.findUnique({
    where: { id: listingId },
  });
  if (!listing || listing.sellerId !== userId) {
    throw new EconomyError("LISTING_NOT_FOUND");
  }
  validateListingEconomics(listing.quantity, unitPrice);
  const updated = await db.playerShopListing.updateMany({
    where: { id: listingId, sellerId: userId, status: "ACTIVE" },
    data: { unitPrice },
  });
  if (updated.count === 0) {
    throw new EconomyError("LISTING_NOT_ACTIVE");
  }
}

/** Cancels an active listing and returns the escrow immediately. */
export async function cancelListing(
  db: PrismaClient,
  {
    userId,
    listingId,
    idempotencyKey,
  }: { userId: string; listingId: string; idempotencyKey: string },
): Promise<ListingResult> {
  await enforceRateLimit(db, "listing-mutation", userId);

  const { result } = await withIdempotency<ListingResult>(
    db,
    {
      userId,
      operation: "listing-cancel",
      key: idempotencyKey,
      requestHash: requestHash({ listingId }),
    },
    async (tx) => {
      const claimed = await tx.playerShopListing.updateMany({
        where: { id: listingId, sellerId: userId, status: "ACTIVE" },
        data: { status: "CANCELLED" },
      });
      if (claimed.count === 0) {
        throw new EconomyError("LISTING_NOT_ACTIVE");
      }
      const listing = await tx.playerShopListing.findUniqueOrThrow({
        where: { id: listingId },
        include: { item: true },
      });

      if (listing.itemInstanceId) {
        await releaseInstance(tx, {
          userId,
          instanceId: listing.itemInstanceId,
        });
      } else {
        await tx.inventoryEntry.upsert({
          where: { userId_itemId: { userId, itemId: listing.itemId } },
          create: { userId, itemId: listing.itemId, quantity: listing.quantity },
          update: { quantity: { increment: listing.quantity } },
        });
      }

      await tx.transaction.create({
        data: {
          userId,
          type: "PLAYER_LISTING_CANCEL",
          itemId: listing.itemId,
          itemInstanceId: listing.itemInstanceId,
          playerListingId: listing.id,
          quantity: listing.quantity,
          note: `Cancelled listing of ${listing.quantity} × ${listing.item.name}`,
        },
      });

      return {
        listingId: listing.id,
        itemSlug: listing.item.slug,
        quantity: listing.quantity,
        unitPrice: listing.unitPrice,
      };
    },
  );
  return result;
}

export interface PlayerPurchaseResult {
  [key: string]: string | number;
  listingId: string;
  itemSlug: string;
  itemName: string;
  quantity: number;
  totalPrice: number;
  sellerUsername: string;
}

/**
 * Atomic player-shop purchase. The status flip (ACTIVE → SOLD) is the race
 * winner-picker: exactly one buyer's guarded update succeeds. Proceeds go
 * to the seller's shop till, never directly to the wallet.
 */
export async function purchaseListing(
  db: PrismaClient,
  {
    buyerId,
    listingId,
    idempotencyKey,
    now = new Date(),
  }: { buyerId: string; listingId: string; idempotencyKey: string; now?: Date },
): Promise<PlayerPurchaseResult> {
  await enforceRateLimit(db, "player-purchase", buyerId, now);
  await assertCommerceAllowed(db, buyerId);

  const { result } = await withIdempotency<PlayerPurchaseResult>(
    db,
    {
      userId: buyerId,
      operation: "listing-purchase",
      key: idempotencyKey,
      requestHash: requestHash({ listingId }),
    },
    async (tx) => {
      const listing = await tx.playerShopListing.findUnique({
        where: { id: listingId },
        include: { item: true, seller: { select: { id: true, username: true } }, shop: true },
      });
      if (!listing) {
        throw new EconomyError("LISTING_NOT_FOUND");
      }
      if (listing.sellerId === buyerId) {
        throw new EconomyError("SELF_PURCHASE");
      }
      if (!listing.shop.active) {
        throw new EconomyError("SHOP_INACTIVE");
      }

      const won = await tx.playerShopListing.updateMany({
        where: { id: listingId, status: "ACTIVE" },
        data: { status: "SOLD", buyerId, soldAt: now },
      });
      if (won.count === 0) {
        throw new EconomyError("ALREADY_SOLD");
      }

      const totalPrice = listing.unitPrice * listing.quantity;
      await debitCoins(tx, { userId: buyerId, amount: totalPrice });

      if (listing.itemInstanceId) {
        await transferEscrowedInstance(tx, {
          instanceId: listing.itemInstanceId,
          fromUserId: listing.sellerId,
          toUserId: buyerId,
          note: `Sold via ${listing.shop.name}`,
          now,
        });
      } else {
        await tx.inventoryEntry.upsert({
          where: { userId_itemId: { userId: buyerId, itemId: listing.itemId } },
          create: { userId: buyerId, itemId: listing.itemId, quantity: listing.quantity },
          update: { quantity: { increment: listing.quantity } },
        });
      }

      await tx.playerShop.update({
        where: { id: listing.shopId },
        data: {
          unclaimedProceeds: { increment: totalPrice },
          lifetimeRevenue: { increment: totalPrice },
        },
      });

      await tx.transaction.create({
        data: {
          userId: buyerId,
          type: "PLAYER_PURCHASE",
          counterpartyUserId: listing.sellerId,
          itemId: listing.itemId,
          itemInstanceId: listing.itemInstanceId,
          playerListingId: listing.id,
          quantity: listing.quantity,
          coinsDelta: -totalPrice,
          note: `Bought ${listing.quantity} × ${listing.item.name} from ${listing.seller.username}`,
        },
      });
      await tx.transaction.create({
        data: {
          userId: listing.sellerId,
          type: "PLAYER_SALE",
          counterpartyUserId: buyerId,
          itemId: listing.itemId,
          itemInstanceId: listing.itemInstanceId,
          playerListingId: listing.id,
          quantity: listing.quantity,
          coinsDelta: 0,
          note: `Sold ${listing.quantity} × ${listing.item.name} — ${totalPrice} coins added to the shop till`,
          metadata: { proceeds: totalPrice },
        },
      });

      if (totalPrice >= HIGH_VALUE_THRESHOLD) {
        await recordSecurityEvent(tx, {
          userId: buyerId,
          type: "high-value-player-purchase",
          message: `Player purchase of listing ${listingId} for ${totalPrice}`,
          metadata: { listingId, totalPrice, sellerId: listing.sellerId },
        });
      }

      return {
        listingId: listing.id,
        itemSlug: listing.item.slug,
        itemName: listing.item.name,
        quantity: listing.quantity,
        totalPrice,
        sellerUsername: listing.seller.username,
      };
    },
  );
  return result;
}

export interface ClaimResult {
  [key: string]: number;
  claimed: number;
}

/**
 * Claims the full till balance into the wallet, exactly once: the guarded
 * equality update means concurrent claims cannot credit the same coins
 * twice.
 */
export async function claimProceeds(
  db: PrismaClient,
  { userId, idempotencyKey }: { userId: string; idempotencyKey: string },
): Promise<ClaimResult> {
  await enforceRateLimit(db, "proceeds-claim", userId);

  const { result } = await withIdempotency<ClaimResult>(
    db,
    {
      userId,
      operation: "proceeds-claim",
      key: idempotencyKey,
      requestHash: requestHash({}),
    },
    async (tx) => {
      const shop = await tx.playerShop.findUnique({ where: { ownerId: userId } });
      if (!shop) {
        throw new EconomyError("SHOP_NOT_FOUND");
      }
      const amount = shop.unclaimedProceeds;
      if (amount <= 0) {
        throw new EconomyError("NOTHING_TO_CLAIM");
      }
      const cleared = await tx.playerShop.updateMany({
        where: { id: shop.id, unclaimedProceeds: amount },
        data: { unclaimedProceeds: 0 },
      });
      if (cleared.count === 0) {
        // A concurrent sale or claim changed the balance mid-flight.
        throw new EconomyError("CONCURRENT_MODIFICATION");
      }
      await creditCoins(tx, { userId, amount });
      await tx.transaction.create({
        data: {
          userId,
          type: "PROCEEDS_CLAIM",
          coinsDelta: amount,
          note: `Claimed ${amount} coins from the shop till`,
        },
      });
      return { claimed: amount };
    },
  );
  return result;
}

export interface UpgradeResult {
  [key: string]: number;
  tier: number;
  newCapacity: number;
}

/**
 * Purchases the next capacity upgrade tier. Tiers are content rows; the
 * prerequisite is owning every lower tier; the unique (shop, tier)
 * constraint backstops double purchases.
 */
export async function purchaseCapacityUpgrade(
  db: PrismaClient,
  {
    userId,
    tier,
    idempotencyKey,
  }: { userId: string; tier: number; idempotencyKey: string },
): Promise<UpgradeResult> {
  await enforceRateLimit(db, "capacity-upgrade", userId);
  await assertCommerceAllowed(db, userId);
  const shop = await ensurePlayerShop(db, userId);

  const { result } = await withIdempotency<UpgradeResult>(
    db,
    {
      userId,
      operation: "capacity-upgrade",
      key: idempotencyKey,
      requestHash: requestHash({ tier }),
    },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pshop:" + shop.id}))`;

      const tierRow = await tx.playerShopUpgradeTier.findUnique({
        where: { tier },
      });
      if (!tierRow || !tierRow.active) {
        throw new EconomyError("UPGRADE_NOT_FOUND");
      }
      const owned = await tx.playerShopUpgradePurchase.findMany({
        where: { shopId: shop.id },
        include: { tier: true },
      });
      if (owned.some((purchase) => purchase.tier.tier === tier)) {
        throw new EconomyError("UPGRADE_ALREADY_OWNED");
      }
      const ownedTiers = new Set(owned.map((purchase) => purchase.tier.tier));
      for (let required = 1; required < tier; required++) {
        if (!ownedTiers.has(required)) {
          throw new EconomyError("UPGRADE_PREREQUISITE_MISSING");
        }
      }

      await debitCoins(tx, { userId, amount: tierRow.price });
      await tx.playerShopUpgradePurchase.create({
        data: { shopId: shop.id, tierId: tierRow.id },
      });
      const updated = await tx.playerShop.update({
        where: { id: shop.id },
        data: { listingCapacity: { increment: tierRow.capacityBonus } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: "CAPACITY_UPGRADE",
          coinsDelta: -tierRow.price,
          note: `Bought shop upgrade "${tierRow.name}" (+${tierRow.capacityBonus} slots)`,
          metadata: { tier: tierRow.tier },
        },
      });
      return { tier: tierRow.tier, newCapacity: updated.listingCapacity };
    },
  );
  return result;
}
