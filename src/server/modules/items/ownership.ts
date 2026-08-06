import type { Item } from "@prisma/client";
import type { DbTx } from "@/server/db";
import { EconomyError } from "@/server/modules/commerce/errors";
import { isDistributable } from "./lifecycle";

/**
 * Hybrid ownership commands (docs/content-model.md): stackable definitions
 * use quantity inventory rows; non-stackable definitions use per-copy
 * ItemInstance records. All helpers are transaction-scoped (DbTx) and never
 * begin their own transaction. Instance history is written to the
 * append-only ItemProvenanceEvent table — never to mutable JSON.
 */

export interface GrantResult {
  instanceIds: string[];
}

/**
 * Why a grant is happening. Callers must say, because the two cases have
 * opposite answers for a kill-switched item:
 *
 * - `distribution` — new copies entering circulation (shop purchases,
 *   daily rewards, request rewards, starter packs). Refused unless the item
 *   is currently distributable.
 * - `restoration` — property the player already had coming back (escrow
 *   returns) or a deliberate operator adjustment. Allowed for any
 *   lifecycle: pulling an item out of circulation must never also confiscate
 *   the copies people already owned.
 */
export type GrantReason = "distribution" | "restoration";

/** Grants quantity of an item to a user, creating instances when required. */
export async function grantItem(
  tx: DbTx,
  {
    userId,
    item,
    quantity,
    reason,
    source,
    transactionId,
    now = new Date(),
  }: {
    userId: string;
    item: Item;
    quantity: number;
    reason: GrantReason;
    /** Human-readable origin, e.g. "npc-shop:mossy-market". */
    source: string;
    /** Ledger row that caused this grant, when one exists. */
    transactionId?: string;
    now?: Date;
  },
): Promise<GrantResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new EconomyError("INVALID_QUANTITY");
  }

  if (reason === "distribution") {
    // Re-read the lifecycle inside the granting transaction. Callers pass
    // an `Item` they loaded earlier — daily rewards in particular select a
    // prize from a pool snapshot read before the transaction opens — so the
    // caller's copy can be arbitrarily stale, and the kill switch is only
    // as good as the last check before the write. Checking here covers
    // every distribution path at once instead of once per caller.
    //
    // This narrows the window to the transaction rather than closing it: an
    // operator's disable committing after this read still lets one grant
    // through. Locking the item row on every purchase would close it, at
    // the cost of serializing hot items against each other; one extra copy
    // is not worth that.
    const current = await tx.item.findUnique({
      where: { id: item.id },
      select: { lifecycle: true },
    });
    if (!current) {
      throw new EconomyError("ITEM_NOT_FOUND");
    }
    if (!isDistributable(current.lifecycle)) {
      throw new EconomyError("ITEM_INACTIVE");
    }
  }

  if (item.stackable) {
    await tx.inventoryEntry.upsert({
      where: { userId_itemId: { userId, itemId: item.id } },
      create: { userId, itemId: item.id, quantity },
      update: { quantity: { increment: quantity } },
    });
    return { instanceIds: [] };
  }

  const instanceIds: string[] = [];
  for (let i = 0; i < quantity; i++) {
    const instance = await tx.itemInstance.create({
      data: {
        itemId: item.id,
        ownerId: userId,
        acquisitionSource: source,
        acquiredAt: now,
      },
    });
    if (item.provenancePolicy !== "NONE") {
      await tx.itemProvenanceEvent.create({
        data: {
          itemInstanceId: instance.id,
          eventType: "created",
          toUserId: userId,
          sourceType: source,
          transactionId: transactionId ?? null,
          metadata: { note: `Entered circulation via ${source}` },
          createdAt: now,
        },
      });
    }
    instanceIds.push(instance.id);
  }
  return { instanceIds };
}

/** Removes quantity of a stackable item; guarded against overdraw. */
export async function removeItem(
  tx: DbTx,
  { userId, itemId, quantity }: { userId: string; itemId: string; quantity: number },
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new EconomyError("INVALID_QUANTITY");
  }
  const result = await tx.inventoryEntry.updateMany({
    where: { userId, itemId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (result.count === 0) {
    throw new EconomyError("INSUFFICIENT_ITEMS");
  }
}

/** Escrows an owned instance (used when a listing is created). */
export async function escrowInstance(
  tx: DbTx,
  { userId, instanceId }: { userId: string; instanceId: string },
): Promise<void> {
  const result = await tx.itemInstance.updateMany({
    where: { id: instanceId, ownerId: userId, status: "OWNED" },
    data: { status: "ESCROWED" },
  });
  if (result.count === 0) {
    throw new EconomyError("INSTANCE_NOT_OWNED");
  }
}

/** Returns an escrowed instance to its owner (listing cancelled/disabled). */
export async function releaseInstance(
  tx: DbTx,
  { userId, instanceId }: { userId: string; instanceId: string },
): Promise<void> {
  const result = await tx.itemInstance.updateMany({
    where: { id: instanceId, ownerId: userId, status: "ESCROWED" },
    data: { status: "OWNED" },
  });
  if (result.count === 0) {
    throw new EconomyError("CONCURRENT_MODIFICATION");
  }
}

/**
 * Transfers an escrowed instance to a buyer. FULL_HISTORY definitions get
 * an append-only provenance event linked to the causing ledger row.
 */
export async function transferEscrowedInstance(
  tx: DbTx,
  {
    instanceId,
    fromUserId,
    toUserId,
    note,
    sourceType,
    transactionId,
    now = new Date(),
  }: {
    instanceId: string;
    fromUserId: string;
    toUserId: string;
    note: string;
    sourceType: string;
    transactionId?: string;
    now?: Date;
  },
): Promise<void> {
  const instance = await tx.itemInstance.findUnique({
    where: { id: instanceId },
    include: { item: true },
  });
  if (!instance || instance.ownerId !== fromUserId || instance.status !== "ESCROWED") {
    throw new EconomyError("CONCURRENT_MODIFICATION");
  }

  await tx.itemInstance.update({
    where: { id: instanceId },
    data: { ownerId: toUserId, status: "OWNED" },
  });

  if (instance.item.provenancePolicy === "FULL_HISTORY") {
    await tx.itemProvenanceEvent.create({
      data: {
        itemInstanceId: instanceId,
        eventType: "transferred",
        fromUserId,
        toUserId,
        sourceType,
        transactionId: transactionId ?? null,
        metadata: { note },
        createdAt: now,
      },
    });
  }
}
