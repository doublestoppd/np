import type { Prisma, PrismaClient } from "@prisma/client";

/** Bounded, ordered display slots on the public profile. */
export const SHOWCASE_MAX = 6;

export type ShowcaseErrorCode =
  | "ITEM_NOT_OWNED"
  | "ALREADY_SHOWCASED"
  | "SHOWCASE_FULL"
  | "ENTRY_NOT_FOUND";

export class ShowcaseError extends Error {
  constructor(public readonly code: ShowcaseErrorCode) {
    super(code);
    this.name = "ShowcaseError";
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Reads the user's showcase inside a transaction, dropping entries whose
 * owned quantity has fallen to zero (write-time pruning of stale
 * references). Returns surviving entries in display order.
 */
async function readAndPrune(tx: Tx, userId: string) {
  const entries = await tx.showcaseEntry.findMany({
    where: { userId },
    orderBy: { position: "asc" },
  });
  const owned = await tx.inventoryEntry.findMany({
    where: {
      userId,
      itemId: { in: entries.map((entry) => entry.itemId) },
      quantity: { gt: 0 },
    },
    select: { itemId: true },
  });
  const ownedIds = new Set(owned.map((entry) => entry.itemId));
  return entries.filter((entry) => ownedIds.has(entry.itemId));
}

/** Rewrites the showcase atomically with normalized positions 0..n-1. */
async function rewrite(tx: Tx, userId: string, itemIds: string[]) {
  await tx.showcaseEntry.deleteMany({ where: { userId } });
  if (itemIds.length > 0) {
    await tx.showcaseEntry.createMany({
      data: itemIds.map((itemId, position) => ({ userId, itemId, position })),
    });
  }
}

/**
 * Appends an owned item to the end of the showcase. Ownership is verified in
 * the same transaction; duplicates and overflow are rejected.
 */
export async function addShowcaseItem(
  db: PrismaClient,
  { userId, itemId }: { userId: string; itemId: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const ownedEntry = await tx.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId } },
    });
    if (!ownedEntry || ownedEntry.quantity < 1) {
      throw new ShowcaseError("ITEM_NOT_OWNED");
    }
    const entries = await readAndPrune(tx, userId);
    if (entries.some((entry) => entry.itemId === itemId)) {
      throw new ShowcaseError("ALREADY_SHOWCASED");
    }
    if (entries.length >= SHOWCASE_MAX) {
      throw new ShowcaseError("SHOWCASE_FULL");
    }
    await rewrite(tx, userId, [
      ...entries.map((entry) => entry.itemId),
      itemId,
    ]);
  });
}

export async function removeShowcaseItem(
  db: PrismaClient,
  { userId, itemId }: { userId: string; itemId: string },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const entries = await readAndPrune(tx, userId);
    if (!entries.some((entry) => entry.itemId === itemId)) {
      throw new ShowcaseError("ENTRY_NOT_FOUND");
    }
    await rewrite(
      tx,
      userId,
      entries
        .filter((entry) => entry.itemId !== itemId)
        .map((entry) => entry.itemId),
    );
  });
}

/**
 * Moves an entry one step toward the front ("up") or back ("down").
 * Moving past either end is a harmless no-op, so double-submitted taps on
 * mobile never error.
 */
export async function moveShowcaseItem(
  db: PrismaClient,
  {
    userId,
    itemId,
    direction,
  }: { userId: string; itemId: string; direction: "up" | "down" },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const entries = await readAndPrune(tx, userId);
    const index = entries.findIndex((entry) => entry.itemId === itemId);
    if (index === -1) {
      throw new ShowcaseError("ENTRY_NOT_FOUND");
    }
    const target = direction === "up" ? index - 1 : index + 1;
    const ids = entries.map((entry) => entry.itemId);
    if (target >= 0 && target < ids.length) {
      const current = ids[index] as string;
      ids[index] = ids[target] as string;
      ids[target] = current;
    }
    await rewrite(tx, userId, ids);
  });
}

/** Ordered, ownership-valid showcase entries with item data, for the editor. */
export async function listShowcase(db: PrismaClient, userId: string) {
  const entries = await db.showcaseEntry.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    include: { item: { include: { category: true } } },
  });
  const owned = await db.inventoryEntry.findMany({
    where: {
      userId,
      itemId: { in: entries.map((entry) => entry.itemId) },
      quantity: { gt: 0 },
    },
    select: { itemId: true },
  });
  const ownedIds = new Set(owned.map((entry) => entry.itemId));
  return entries.filter((entry) => ownedIds.has(entry.itemId));
}
