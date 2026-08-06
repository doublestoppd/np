import type { DbClient } from "@/server/db";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { recordSecurityEvent, flagIfSuspicious } from "@/server/security/audit";
import { LIMITS } from "@/server/security/limits";
import { coinsToJSON } from "@/lib/money";
import { EconomyError } from "../errors";
import { enforceCommerceRateLimit, HIGH_VALUE_THRESHOLD } from "../config";
import { assertCommerceAccess, isNpcListingPurchasable } from "../policies";
import { debitCoins } from "../wallet";
import { recordLedger } from "../ledger";
import { grantItem } from "@/server/modules/items/ownership";
import { ensureShopStocked } from "../restocking/execute";

export interface NpcPurchaseResult {
  [key: string]: string | number;
  stockId: string;
  itemSlug: string;
  itemName: string;
  quantity: number;
  /** Serialized coins (src/lib/money.ts). */
  totalPrice: string;
}

/**
 * Atomic NPC purchase. Fixed server-stored price; guarded stock decrement
 * and wallet debit make double-sales and overspending impossible under
 * concurrency; idempotency keys make retries return the original result.
 */
export async function purchaseFromNpcShop(
  db: DbClient,
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
    quantity > LIMITS.npcPurchaseQuantity
  ) {
    throw new EconomyError("INVALID_QUANTITY");
  }

  await enforceCommerceRateLimit(db, "npc-purchase", userId, now);
  await assertCommerceAccess(db, userId);

  // Lazy restock fallback (non-blocking) before purchasing. If a restock is
  // mid-flight, the guarded status check below still prevents selling stock
  // that the replacement invalidates first.
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
        if (!stock) {
          throw new EconomyError("OUT_OF_STOCK");
        }
        const verdict = isNpcListingPurchasable(stock);
        if (!verdict.ok) {
          throw new EconomyError(verdict.code);
        }

        const totalPrice = stock.price * BigInt(quantity);

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
        const ledger = await recordLedger(tx, {
          userId,
          type: "NPC_PURCHASE",
          itemId: stock.itemId,
          npcStockId: stock.id,
          restockId: stock.restockId,
          quantity,
          coinsDelta: -totalPrice,
          note: `Bought ${quantity} × ${stock.item.name} at ${stock.shop.name}`,
        });
        const granted = await grantItem(tx, {
          userId,
          item: stock.item,
          quantity,
          source: `npc-shop:${stock.shop.slug}`,
          transactionId: ledger.id,
          now,
        });
        if (granted.instanceIds.length > 0) {
          await tx.transaction.update({
            where: { id: ledger.id },
            data: {
              itemInstanceId: granted.instanceIds[0],
              metadata:
                granted.instanceIds.length > 1
                  ? { instanceIds: granted.instanceIds }
                  : undefined,
            },
          });
        }

        if (totalPrice >= HIGH_VALUE_THRESHOLD) {
          await recordSecurityEvent(tx, {
            userId,
            type: "high-value-npc-purchase",
            message: `NPC purchase of ${quantity} × ${stock.item.slug} for ${coinsToJSON(totalPrice)}`,
            metadata: { stockId, totalPrice: coinsToJSON(totalPrice) },
          });
        }

        return {
          stockId,
          itemSlug: stock.item.slug,
          itemName: stock.item.name,
          quantity,
          totalPrice: coinsToJSON(totalPrice),
        };
      },
    );
    return result;
  } catch (error) {
    if (error instanceof EconomyError && error.economyCode === "OUT_OF_STOCK") {
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
