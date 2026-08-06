import { Prisma } from "@prisma/client";
import type { ShopRestock } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { log, timed } from "@/server/logging";
import { EconomyError } from "../errors";
import { planRestock } from "./plan";
import { computeWindowStart } from "./schedule";

/**
 * Restock execution (docs/architecture-decisions.md ADR-10). Idempotency is
 * anchored by the unique (shopId, windowStart) constraint plus a per-shop
 * advisory lock; stock replacement is atomic. Failures persist an auditable
 * FAILED record OUTSIDE the rolled-back transaction, with an attempt
 * counter; replaying a failed window is safe and produces one inventory.
 */

class RestockLockBusyError extends DomainError {
  constructor() {
    super("RESTOCK_LOCK_BUSY", "Restock already in progress");
  }
}

async function runRestockTransaction(
  db: DbClient,
  {
    shopId,
    windowStart,
    secret,
    nonBlocking,
    now,
  }: {
    shopId: string;
    windowStart: Date;
    secret?: string;
    nonBlocking: boolean;
    now: Date;
  },
): Promise<ShopRestock> {
  return db.$transaction(async (tx) => {
    if (nonBlocking) {
      // Non-blocking: page loads and purchases never queue behind a restock.
      const [row] = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext(${shopId})) AS locked`;
      if (!row?.locked) {
        throw new RestockLockBusyError();
      }
    } else {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shopId}))`;
    }

    const existing = await tx.shopRestock.findUnique({
      where: { shopId_windowStart: { shopId, windowStart } },
    });
    if (existing && existing.status === "COMPLETED") {
      return existing;
    }

    const shop = await tx.npcShop.findUnique({
      where: { id: shopId },
      include: { restockConfig: true, poolEntries: { include: { item: true } } },
    });
    if (!shop || !shop.restockConfig) {
      throw new EconomyError("SHOP_NOT_FOUND");
    }

    const plan = planRestock({
      shopId,
      windowStart,
      config: shop.restockConfig,
      poolEntries: shop.poolEntries,
      secret,
    });

    const restock =
      existing ??
      (await tx.shopRestock.create({
        data: { shopId, windowStart, seedId: plan.seedId, status: "PENDING" },
      }));

    // Full atomic replacement: expire everything, insert the new stock.
    await tx.npcShopStock.updateMany({
      where: { shopId, status: { in: ["ACTIVE", "SOLD_OUT"] } },
      data: { status: "EXPIRED" },
    });
    if (plan.listings.length > 0) {
      await tx.npcShopStock.createMany({
        data: plan.listings.map((listing) => ({
          shopId,
          itemId: listing.itemId,
          restockId: restock.id,
          price: listing.price,
          quantity: listing.quantity,
          initialQuantity: listing.quantity,
          status: "ACTIVE" as const,
        })),
      });
    }

    return tx.shopRestock.update({
      where: { id: restock.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        seedId: plan.seedId,
        error: null,
        summary: {
          composition: plan.composition,
          backfilled: plan.backfilled,
          ultraRareSelected: plan.ultraRareSelected,
          listings: plan.listings.map((listing) => ({
            slug: listing.itemSlug,
            rarity: listing.shopRarity,
            price: listing.price.toString(),
            quantity: listing.quantity,
          })),
        } as Prisma.InputJsonValue,
      },
    });
  });
}

/**
 * Persists an auditable FAILED record for a window whose replacement rolled
 * back. Deliberately OUTSIDE the failed transaction; never downgrades a
 * COMPLETED record.
 */
async function persistFailure(
  db: DbClient,
  { shopId, windowStart, error }: { shopId: string; windowStart: Date; error: string },
): Promise<void> {
  const safeError = error.slice(0, 500);
  try {
    const updated = await db.shopRestock.updateMany({
      where: { shopId, windowStart, status: { not: "COMPLETED" } },
      data: { status: "FAILED", error: safeError, attemptCount: { increment: 1 } },
    });
    if (updated.count === 0) {
      const existing = await db.shopRestock.findUnique({
        where: { shopId_windowStart: { shopId, windowStart } },
      });
      if (!existing) {
        await db.shopRestock.create({
          data: {
            shopId,
            windowStart,
            seedId: "",
            status: "FAILED",
            error: safeError,
            attemptCount: 1,
          },
        });
      }
    }
  } catch (persistError) {
    log.error("restock.failure-record", {
      shopId,
      window: windowStart.toISOString(),
      error: persistError instanceof Error ? persistError.message.slice(0, 200) : "unknown",
    });
  }
}

export interface ExecuteRestockOptions {
  shopId: string;
  windowStart: Date;
  secret?: string;
  /** Use the non-blocking lock (lazy/read-triggered paths). */
  nonBlocking?: boolean;
  now?: Date;
}

/**
 * Executes (or returns) the restock for a shop's given window. Retries of a
 * FAILED window reuse the same record and produce exactly one inventory.
 * Throws RESTOCK_LOCK_BUSY (DomainError) in nonBlocking mode when another
 * request holds the shop lock.
 */
export async function executeRestock(
  db: DbClient,
  { shopId, windowStart, secret, nonBlocking = false, now = new Date() }: ExecuteRestockOptions,
): Promise<ShopRestock> {
  try {
    return await timed(
      "restock.execute",
      { shopId, window: windowStart.toISOString(), nonBlocking },
      () => runRestockTransaction(db, { shopId, windowStart, secret, nonBlocking, now }),
    );
  } catch (error) {
    if (error instanceof RestockLockBusyError) {
      log.info("restock.lock-contention", { shopId, window: windowStart.toISOString() });
      throw error;
    }
    await persistFailure(db, {
      shopId,
      windowStart,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
}

export type EnsureOutcome = "current" | "refreshed" | "busy" | "disabled";

/**
 * Read-triggered restock fallback (a deliberate, documented mutation on a
 * read path): brings the shop to its current scheduled window if the
 * scheduler missed it. NON-BLOCKING — when another request is already
 * restocking, callers serve the prior valid inventory ("busy") instead of
 * queueing behind the lock.
 */
export async function ensureShopStocked(
  db: DbClient,
  shopId: string,
  now: Date = new Date(),
): Promise<EnsureOutcome> {
  const config = await db.npcShopRestockConfig.findUnique({ where: { shopId } });
  if (!config || !config.enabled) {
    return "disabled";
  }
  const windowStart = computeWindowStart(config, now);
  if (!windowStart) {
    return "disabled";
  }
  const existing = await db.shopRestock.findUnique({
    where: { shopId_windowStart: { shopId, windowStart } },
    select: { status: true },
  });
  if (existing?.status === "COMPLETED") {
    return "current";
  }
  try {
    await executeRestock(db, { shopId, windowStart, nonBlocking: true, now });
    return "refreshed";
  } catch (error) {
    if (error instanceof DomainError && error.code === "RESTOCK_LOCK_BUSY") {
      return "busy";
    }
    throw error;
  }
}

/** Runs due restocks for every enabled shop; used by the cron endpoint. */
export async function runDueRestocks(
  db: DbClient,
  now: Date = new Date(),
): Promise<Array<{ shopId: string; slug: string; status: string }>> {
  const shops = await db.npcShop.findMany({
    where: { active: true, restockConfig: { isNot: null } },
    select: { id: true, slug: true, restockConfig: true },
  });
  const results: Array<{ shopId: string; slug: string; status: string }> = [];
  for (const shop of shops) {
    try {
      const windowStart = shop.restockConfig
        ? computeWindowStart(shop.restockConfig, now)
        : null;
      if (!windowStart || !shop.restockConfig?.enabled) {
        results.push({ shopId: shop.id, slug: shop.slug, status: "skipped" });
        continue;
      }
      await executeRestock(db, { shopId: shop.id, windowStart, now });
      results.push({ shopId: shop.id, slug: shop.slug, status: "ok" });
    } catch (error) {
      results.push({
        shopId: shop.id,
        slug: shop.slug,
        status: error instanceof Error ? error.message.slice(0, 80) : "error",
      });
    }
  }
  return results;
}
