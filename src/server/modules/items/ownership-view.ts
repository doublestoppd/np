import type { ItemInstanceStatus, ItemLifecycle, ItemType, Rarity } from "@prisma/client";
import type { DbReader } from "@/server/db";
import type { InventorySort } from "@/lib/validation";
import { isPlayerVisible, isSellable, isUsable } from "./lifecycle";

/**
 * The unified ownership boundary (docs/conventions.md). Every surface that
 * shows or selects "things the player owns" — inventory, item details,
 * showcases, listing forms — consumes OwnedAsset values and the policy
 * helpers below, never raw Prisma rows.
 */

export interface OwnedItemSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  artKey: string;
  categorySlug: string | null;
  categoryName: string | null;
  rarity: Rarity;
  lifecycle: ItemLifecycle;
  type: ItemType | null;
  tradeable: boolean;
  stackable: boolean;
  /** Estimated value in coins. */
  price: bigint;
  hungerRestore: number | null;
  happinessBoost: number | null;
  tags: Array<{ slug: string; name: string }>;
}

export type OwnedAsset =
  | {
      kind: "stack";
      item: OwnedItemSummary;
      quantity: number;
    }
  | {
      kind: "instance";
      item: OwnedItemSummary;
      instanceId: string;
      status: ItemInstanceStatus;
      acquiredAt: Date;
      acquisitionSource: string;
    };

const ITEM_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  artKey: true,
  rarity: true,
  lifecycle: true,
  type: true,
  tradeable: true,
  stackable: true,
  price: true,
  hungerRestore: true,
  happinessBoost: true,
  category: { select: { slug: true, name: true } },
  tags: { select: { slug: true, name: true } },
} as const;

type ItemRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  artKey: string;
  rarity: Rarity;
  lifecycle: ItemLifecycle;
  type: ItemType | null;
  tradeable: boolean;
  stackable: boolean;
  price: bigint;
  hungerRestore: number | null;
  happinessBoost: number | null;
  category: { slug: string; name: string } | null;
  tags: Array<{ slug: string; name: string }>;
};

function toSummary(item: ItemRow): OwnedItemSummary {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    artKey: item.artKey,
    categorySlug: item.category?.slug ?? null,
    categoryName: item.category?.name ?? null,
    rarity: item.rarity,
    lifecycle: item.lifecycle,
    type: item.type,
    tradeable: item.tradeable,
    stackable: item.stackable,
    price: item.price,
    hungerRestore: item.hungerRestore,
    happinessBoost: item.happinessBoost,
    tags: item.tags,
  };
}

export interface OwnedAssetQuery {
  /** Case-insensitive match on item name/description. */
  search?: string;
  /** ItemCategory slug filter. */
  category?: string;
  sort?: InventorySort;
  /** Escrowed instances are excluded unless explicitly requested. */
  includeEscrowed?: boolean;
}

/**
 * Everything the user owns — stacks and instances — as one list. DISABLED
 * and DRAFT definitions are excluded from player views; escrowed instances
 * are excluded unless requested (they are not available for use).
 */
export async function listOwnedAssets(
  db: DbReader,
  userId: string,
  { search, category, sort = "name", includeEscrowed = false }: OwnedAssetQuery = {},
): Promise<OwnedAsset[]> {
  const itemFilter = {
    lifecycle: { in: ["ACTIVE", "RETIRED"] as ItemLifecycle[] },
    ...(search && search.trim() !== ""
      ? {
          OR: [
            { name: { contains: search.trim(), mode: "insensitive" as const } },
            { description: { contains: search.trim(), mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(category ? { category: { slug: category } } : {}),
  };

  const [stacks, instances] = await Promise.all([
    db.inventoryEntry.findMany({
      where: { userId, quantity: { gt: 0 }, item: itemFilter },
      select: { quantity: true, item: { select: ITEM_SELECT } },
    }),
    db.itemInstance.findMany({
      where: {
        ownerId: userId,
        ...(includeEscrowed ? { status: { in: ["OWNED", "ESCROWED"] } } : { status: "OWNED" }),
        item: itemFilter,
      },
      select: {
        id: true,
        status: true,
        acquiredAt: true,
        acquisitionSource: true,
        item: { select: ITEM_SELECT },
      },
      orderBy: { acquiredAt: "asc" },
    }),
  ]);

  const assets: OwnedAsset[] = [
    ...stacks.map(
      (entry): OwnedAsset => ({
        kind: "stack",
        item: toSummary(entry.item),
        quantity: entry.quantity,
      }),
    ),
    ...instances.map(
      (instance): OwnedAsset => ({
        kind: "instance",
        item: toSummary(instance.item),
        instanceId: instance.id,
        status: instance.status,
        acquiredAt: instance.acquiredAt,
        acquisitionSource: instance.acquisitionSource,
      }),
    ),
  ];

  const quantityOf = (asset: OwnedAsset) =>
    asset.kind === "stack" ? asset.quantity : 1;
  assets.sort((a, b) => {
    if (sort === "quantity") {
      return quantityOf(b) - quantityOf(a) || a.item.name.localeCompare(b.item.name);
    }
    if (sort === "value") {
      const diff = b.item.price - a.item.price;
      return diff === 0n ? a.item.name.localeCompare(b.item.name) : diff > 0n ? 1 : -1;
    }
    return a.item.name.localeCompare(b.item.name);
  });
  return assets;
}

// ---- Ownership policy helpers (one shared policy; docs/conventions.md) ----

/** Usable now (feeding, playing): not escrowed, lifecycle allows use. */
export function assetIsUsable(asset: OwnedAsset): boolean {
  if (!isUsable(asset.item.lifecycle)) return false;
  return asset.kind === "stack" ? true : asset.status === "OWNED";
}

/** Eligible for the profile showcase. */
export function assetIsShowcaseable(asset: OwnedAsset): boolean {
  if (!isPlayerVisible(asset.item.lifecycle)) return false;
  return asset.kind === "stack" ? asset.quantity > 0 : asset.status === "OWNED";
}

/** Listable in the player shop (escrow-able). */
export function assetIsListable(asset: OwnedAsset): boolean {
  if (!asset.item.tradeable || !isSellable(asset.item.lifecycle)) return false;
  return asset.kind === "stack" ? asset.quantity > 0 : asset.status === "OWNED";
}

