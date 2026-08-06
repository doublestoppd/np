import type { Item, Prisma } from "@prisma/client";
import { EconomyError } from "./errors";
import type { Tx } from "./idempotency";

/**
 * Hybrid ownership (docs/content-model.md): stackable definitions use
 * quantity inventory rows; non-stackable definitions use per-copy
 * ItemInstance records carrying acquisition and provenance data.
 * All mutations are transaction-scoped and server-side only.
 */

interface ProvenanceEvent {
  type: "acquired" | "transferred";
  at: string;
  note: string;
}

function provenanceEvents(value: Prisma.JsonValue): ProvenanceEvent[] {
  return Array.isArray(value) ? (value as unknown as ProvenanceEvent[]) : [];
}

export interface GrantResult {
  instanceIds: string[];
}

/** Grants quantity of an item to a user, creating instances when required. */
export async function grantItem(
  tx: Tx,
  {
    userId,
    item,
    quantity,
    source,
    now = new Date(),
  }: {
    userId: string;
    item: Item;
    quantity: number;
    /** Human-readable origin, e.g. "npc-shop:mossy-market". */
    source: string;
    now?: Date;
  },
): Promise<GrantResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new EconomyError("INVALID_QUANTITY");
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
    const provenance =
      item.provenancePolicy === "NONE"
        ? []
        : [
            {
              type: "acquired",
              at: now.toISOString(),
              note: `Entered circulation via ${source}`,
            } satisfies ProvenanceEvent,
          ];
    const instance = await tx.itemInstance.create({
      data: {
        itemId: item.id,
        ownerId: userId,
        acquisitionSource: source,
        acquiredAt: now,
        provenance: provenance as unknown as Prisma.InputJsonValue,
      },
    });
    instanceIds.push(instance.id);
  }
  return { instanceIds };
}

/** Removes quantity of a stackable item; guarded against overdraw. */
export async function removeItem(
  tx: Tx,
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
  tx: Tx,
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
  tx: Tx,
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
 * Transfers an escrowed instance to a buyer, appending provenance history
 * when the definition's policy is FULL_HISTORY.
 */
export async function transferEscrowedInstance(
  tx: Tx,
  {
    instanceId,
    fromUserId,
    toUserId,
    note,
    now = new Date(),
  }: {
    instanceId: string;
    fromUserId: string;
    toUserId: string;
    note: string;
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

  const provenance = provenanceEvents(instance.provenance);
  if (instance.item.provenancePolicy === "FULL_HISTORY") {
    provenance.push({ type: "transferred", at: now.toISOString(), note });
  }

  await tx.itemInstance.update({
    where: { id: instanceId },
    data: {
      ownerId: toUserId,
      status: "OWNED",
      provenance: provenance as unknown as Prisma.InputJsonValue,
    },
  });
}
