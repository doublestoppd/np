import type { DbClient, DbTx } from "@/server/db";

/** Bounded, ordered display slots on the public profile. */
export const SHOWCASE_MAX = 6;

export type ShowcaseErrorCode =
  | "ITEM_NOT_OWNED"
  | "ALREADY_SHOWCASED"
  | "SHOWCASE_FULL"
  | "ENTRY_NOT_FOUND"
  | "INVALID_REFERENCE";

export class ShowcaseError extends Error {
  constructor(public readonly code: ShowcaseErrorCode) {
    super(code);
    this.name = "ShowcaseError";
  }
}

/**
 * Instance-aware showcases (docs/profile-and-showcases.md):
 * - Stackable definitions are showcased by itemId while the player owns at
 *   least one available copy.
 * - Instanced (unique/provenance-bearing) definitions showcase a specific
 *   OWNED instance; the entry stores both itemId and itemInstanceId.
 * The two modes are mutually exclusive per validated rules — an entry is
 * never an ambiguous combination. Reads hide entries whose ownership,
 * escrow status, or item lifecycle no longer qualifies; writes prune them.
 */

interface ShowcaseRef {
  itemId: string;
  itemInstanceId: string | null;
}

/** Validates ownership/eligibility for a candidate entry inside a tx. */
async function assertOwnedAndEligible(
  tx: DbTx,
  userId: string,
  ref: ShowcaseRef,
): Promise<void> {
  const item = await tx.item.findUnique({ where: { id: ref.itemId } });
  if (!item || (item.lifecycle !== "ACTIVE" && item.lifecycle !== "RETIRED")) {
    throw new ShowcaseError("ITEM_NOT_OWNED");
  }
  if (item.stackable) {
    if (ref.itemInstanceId) {
      throw new ShowcaseError("INVALID_REFERENCE");
    }
    const entry = await tx.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId: ref.itemId } },
    });
    if (!entry || entry.quantity < 1) {
      throw new ShowcaseError("ITEM_NOT_OWNED");
    }
  } else {
    if (!ref.itemInstanceId) {
      throw new ShowcaseError("INVALID_REFERENCE");
    }
    const instance = await tx.itemInstance.findUnique({
      where: { id: ref.itemInstanceId },
    });
    if (
      !instance ||
      instance.itemId !== ref.itemId ||
      instance.ownerId !== userId ||
      instance.status !== "OWNED"
    ) {
      throw new ShowcaseError("ITEM_NOT_OWNED");
    }
  }
}

type EntryRow = {
  itemId: string;
  itemInstanceId: string | null;
  item: { stackable: boolean; lifecycle: string };
  itemInstance: { ownerId: string; status: string } | null;
};

function entryStillValid(userId: string, entry: EntryRow, ownedStackIds: Set<string>): boolean {
  if (entry.item.lifecycle !== "ACTIVE" && entry.item.lifecycle !== "RETIRED") {
    return false;
  }
  if (entry.item.stackable) {
    return entry.itemInstanceId === null && ownedStackIds.has(entry.itemId);
  }
  return (
    entry.itemInstance !== null &&
    entry.itemInstance.ownerId === userId &&
    entry.itemInstance.status === "OWNED"
  );
}

/** Reads valid entries inside a tx, pruning stale references on write. */
async function readAndPrune(tx: DbTx, userId: string) {
  const entries = await tx.showcaseEntry.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    include: {
      item: { select: { stackable: true, lifecycle: true } },
      itemInstance: { select: { ownerId: true, status: true } },
    },
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
  return entries.filter((entry) => entryStillValid(userId, entry, ownedIds));
}

/** Rewrites the showcase atomically with normalized positions 0..n-1. */
async function rewrite(tx: DbTx, userId: string, refs: ShowcaseRef[]) {
  await tx.showcaseEntry.deleteMany({ where: { userId } });
  if (refs.length > 0) {
    await tx.showcaseEntry.createMany({
      data: refs.map((ref, position) => ({
        userId,
        itemId: ref.itemId,
        itemInstanceId: ref.itemInstanceId,
        position,
      })),
    });
  }
}

export async function addShowcaseItem(
  db: DbClient,
  {
    userId,
    itemId,
    itemInstanceId = null,
  }: { userId: string; itemId: string; itemInstanceId?: string | null },
): Promise<void> {
  await db.$transaction(async (tx) => {
    await assertOwnedAndEligible(tx, userId, { itemId, itemInstanceId });
    const entries = await readAndPrune(tx, userId);
    if (entries.some((entry) => entry.itemId === itemId)) {
      throw new ShowcaseError("ALREADY_SHOWCASED");
    }
    if (entries.length >= SHOWCASE_MAX) {
      throw new ShowcaseError("SHOWCASE_FULL");
    }
    await rewrite(tx, userId, [
      ...entries.map((entry) => ({
        itemId: entry.itemId,
        itemInstanceId: entry.itemInstanceId,
      })),
      { itemId, itemInstanceId },
    ]);
  });
}

export async function removeShowcaseItem(
  db: DbClient,
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
        .map((entry) => ({
          itemId: entry.itemId,
          itemInstanceId: entry.itemInstanceId,
        })),
    );
  });
}

/**
 * Moves an entry one step toward the front ("up") or back ("down").
 * Moving past either end is a harmless no-op.
 */
export async function moveShowcaseItem(
  db: DbClient,
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
    const refs = entries.map((entry) => ({
      itemId: entry.itemId,
      itemInstanceId: entry.itemInstanceId,
    }));
    if (target >= 0 && target < refs.length) {
      const current = refs[index] as ShowcaseRef;
      refs[index] = refs[target] as ShowcaseRef;
      refs[target] = current;
    }
    await rewrite(tx, userId, refs);
  });
}

/** Ordered, ownership-valid showcase entries with item data, for the editor. */
export async function listShowcase(db: DbClient, userId: string) {
  const entries = await db.showcaseEntry.findMany({
    where: { userId },
    orderBy: { position: "asc" },
    include: {
      item: { include: { category: true } },
      itemInstance: { select: { ownerId: true, status: true } },
    },
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
  return entries.filter((entry) =>
    entryStillValid(
      userId,
      {
        itemId: entry.itemId,
        itemInstanceId: entry.itemInstanceId,
        item: entry.item,
        itemInstance: entry.itemInstance,
      },
      ownedIds,
    ),
  );
}
