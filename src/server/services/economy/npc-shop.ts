import type { PrismaClient } from "@prisma/client";
import { EconomyError } from "./errors";
import { withIdempotency, requestHash, type Tx } from "./idempotency";
import { enforceRateLimit } from "./rate-limit";
import { recordSecurityEvent, flagIfSuspicious } from "./audit";
import { debitCoins } from "./wallet";
import { grantItem } from "./ownership";
import { ensureShopStocked } from "./restock";
import {
  HIGH_VALUE_THRESHOLD,
  MAX_NPC_PURCHASE_QUANTITY,
} from "./config";

/** Asserts the account is allowed to use commerce at all. */
export async function assertCommerceAllowed(
  db: PrismaClient | Tx,
  userId: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { commerceDisabledAt: true },
  });
  if (!user || user.commerceDisabledAt !== null) {
    throw new EconomyError("COMMERCE_DISABLED");
  }
}

/**
 * Loads an active NPC shop for a location page, applying the lazy restock
 * fallback first so a missed scheduled window self-heals on view. Sold-out
 * and expired rows are excluded from the normal query; restock timing is
 * never included in the payload.
 */
export async function getShopForLocation(
  db: PrismaClient,
  locationId: string,
  now: Date = new Date(),
) {
  const shop = await db.npcShop.findUnique({ where: { locationId } });
  if (!shop || !shop.active) {
    return null;
  }
  await ensureShopStocked(db, shop.id, now);
  const stock = await db.npcShopStock.findMany({
    where: { shopId: shop.id, status: "ACTIVE", quantity: { gt: 0 } },
    include: { item: { include: { category: true } } },
    orderBy: [{ item: { rarity: "desc" } }, { item: { name: "asc" } }],
  });
  return { shop, stock };
}

export interface NpcPurchaseResult {
  [key: string]: string | number;
  stockId: string;
  itemSlug: string;
  itemName: string;
  quantity: number;
  totalPrice: number;
}

/**
 * Atomic NPC purchase. Fixed server-stored price; guarded stock decrement
 * and wallet debit make double-sales and overspending impossible under
 * concurrency; idempotency keys make retries return the original result.
 */
export async function purchaseFromNpcShop(
  db: PrismaClient,
  {
    userId,
    stockId,
    quantity,
    idempotencyKey,
    now = new Date(),
  }: {
    userId: string;
    stockId: string;
    quantity: number;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<NpcPurchaseResult> {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_NPC_PURCHASE_QUANTITY
  ) {
    throw new EconomyError("INVALID_QUANTITY");
  }

  await enforceRateLimit(db, "npc-purchase", userId, now);
  await assertCommerceAllowed(db, userId);

  // Lazy restock fallback before purchasing, per the scheduling rules.
  const preview = await db.npcShopStock.findUnique({
    where: { id: stockId },
    select: { shopId: true },
  });
  if (!preview) {
    throw new EconomyError("OUT_OF_STOCK");
  }
  await ensureShopStocked(db, preview.shopId, now);

  try {
    const { result } = await withIdempotency<NpcPurchaseResult>(
      db,
      {
        userId,
        operation: "npc-purchase",
        key: idempotencyKey,
        requestHash: requestHash({ stockId, quantity }),
      },
      async (tx) => {
        const stock = await tx.npcShopStock.findUnique({
          where: { id: stockId },
          include: { item: true, shop: true },
        });
        if (!stock || !stock.shop.active) {
          throw new EconomyError("OUT_OF_STOCK");
        }
        if (stock.status !== "ACTIVE") {
          // Sold out or expired by a later restock — a "stale" attempt.
          throw new EconomyError("OUT_OF_STOCK");
        }
        if (!stock.item.active) {
          throw new EconomyError("ITEM_INACTIVE");
        }

        const totalPrice = stock.price * quantity;

        const decremented = await tx.npcShopStock.updateMany({
          where: { id: stockId, status: "ACTIVE", quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (decremented.count === 0) {
          throw new EconomyError("OUT_OF_STOCK");
        }
        const after = await tx.npcShopStock.findUniqueOrThrow({
          where: { id: stockId },
          select: { quantity: true },
        });
        if (after.quantity === 0) {
          await tx.npcShopStock.update({
            where: { id: stockId },
            data: { status: "SOLD_OUT" },
          });
        }

        await debitCoins(tx, { userId, amount: totalPrice });
        const granted = await grantItem(tx, {
          userId,
          item: stock.item,
          quantity,
          source: `npc-shop:${stock.shop.slug}`,
          now,
        });

        await tx.transaction.create({
          data: {
            userId,
            type: "NPC_PURCHASE",
            itemId: stock.itemId,
            itemInstanceId: granted.instanceIds[0] ?? null,
            npcStockId: stock.id,
            restockId: stock.restockId,
            quantity,
            coinsDelta: -totalPrice,
            note: `Bought ${quantity} × ${stock.item.name} at ${stock.shop.name}`,
            metadata:
              granted.instanceIds.length > 1
                ? { instanceIds: granted.instanceIds }
                : undefined,
          },
        });

        if (totalPrice >= HIGH_VALUE_THRESHOLD) {
          await recordSecurityEvent(tx, {
            userId,
            type: "high-value-npc-purchase",
            message: `NPC purchase of ${quantity} × ${stock.item.slug} for ${totalPrice}`,
            metadata: { stockId, totalPrice },
          });
        }

        return {
          stockId,
          itemSlug: stock.item.slug,
          itemName: stock.item.name,
          quantity,
          totalPrice,
        };
      },
    );
    return result;
  } catch (error) {
    if (error instanceof EconomyError && error.code === "OUT_OF_STOCK") {
      // Stale/sold-out attempts are a bot signal when they pile up.
      await recordSecurityEvent(db, {
        userId,
        type: "stale-stock-attempt",
        message: `Attempted purchase of unavailable stock ${stockId}`,
        metadata: { stockId },
      });
      await flagIfSuspicious(db, {
        userId,
        type: "stale-stock-attempt",
        threshold: 8,
        windowMinutes: 10,
      });
    }
    throw error;
  }
}
