import type { ItemLifecycle } from "@prisma/client";
import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import {
  isDistributable,
  isPlayerVisible,
  isUsable,
} from "@/server/modules/items/lifecycle";
import { normalizeUsername } from "@/server/modules/accounts/identity";
import { GROWTH_STAGES, growthStage, sizeFits } from "./config";

/**
 * Everything a Hollow page needs, in one shape.
 *
 * Note what is deliberately absent, here and everywhere downstream: there
 * is no catalogue total, no owned-count-over-total, no percentage, no
 * "slots filled", and no rarity. A Hollow is composition, not acquisition,
 * and the moment a view can render "12 of 40" it becomes a checklist — the
 * one thing docs/design-philosophy.md rules out by name. The view models
 * have nowhere to put those numbers, and a test asserts they stay that way.
 */

export interface PlacedFurnishing {
  anchorKey: string;
  itemId: string;
  slug: string;
  name: string;
  artKey: string;
  size: string;
  /** 0..GROWTH_STAGES-1. Static furnishings are always fully grown. */
  stage: number;
  /** True while a growing furnishing still has growing left to do. */
  growing: boolean;
}

export interface HollowAnchorView {
  key: string;
  label: string;
  maxSize: string;
  x: number;
  y: number;
  depth: number;
  standing: PlacedFurnishing | null;
}

export interface HollowSceneView {
  id: string;
  groundKey: string;
  groundName: string;
  groundDescription: string;
  artKey: string;
  airKey: string;
  airName: string;
  caption: string;
  position: number;
  /** Back to front — both the paint order and the reading order. */
  anchors: HollowAnchorView[];
}

export interface HollowAirView {
  key: string;
  name: string;
  description: string;
  /** Serialized coins. Zero for the air every Hollow opens with. */
  price: string;
  held: boolean;
}

export interface HollowGroundOffer {
  key: string;
  name: string;
  description: string;
  artKey: string;
  held: boolean;
}

export interface HollowView {
  sceneCount: number;
  scenes: HollowSceneView[];
  airs: HollowAirView[];
  /** Grounds not yet held, and what the next one costs. */
  grounds: HollowGroundOffer[];
  /** Serialized coins, or null when the catalogue has no more ground. */
  nextGroundPrice: string | null;
}

const SCENE_INCLUDE = {
  ground: { include: { anchors: true } },
  air: true,
  placements: {
    include: { item: { include: { furnishing: true } } },
  },
} as const;

/**
 * Composes one scene. `now` is threaded rather than read here so growth is
 * stable across a render and testable without waiting two months.
 */
function composeScene(
  scene: {
    id: string;
    caption: string;
    position: number;
    ground: {
      key: string;
      name: string;
      description: string;
      artKey: string;
      anchors: Array<{
        key: string;
        label: string;
        maxSize: string;
        x: number;
        y: number;
        depth: number;
      }>;
    };
    air: { key: string; name: string };
    placements: Array<{
      anchorKey: string;
      itemId: string;
      plantedAt: Date;
      item: {
        slug: string;
        name: string;
        artKey: string;
        lifecycle: ItemLifecycle;
        furnishing: { size: string; growthDays: number | null } | null;
      };
    }>;
  },
  now: Date,
): HollowSceneView {
  const standing = new Map<string, PlacedFurnishing>();
  for (const placement of scene.placements) {
    const furnishing = placement.item.furnishing;
    // DISABLED is the moderation kill switch and means "inert everywhere"
    // (docs/conventions.md), so a pulled furnishing stops appearing on the
    // owner's page and on every visitor's. RETIRED keeps rendering: it only
    // stops NEW copies entering circulation. An item that somehow lost its
    // furnishing row is not renderable either; skipping all three is the
    // same read-time filtering showcases use.
    if (!furnishing || !isPlayerVisible(placement.item.lifecycle)) {
      continue;
    }
    const stage = growthStage(placement.plantedAt, furnishing.growthDays, now);
    standing.set(placement.anchorKey, {
      anchorKey: placement.anchorKey,
      itemId: placement.itemId,
      slug: placement.item.slug,
      name: placement.item.name,
      artKey: placement.item.artKey,
      size: furnishing.size,
      stage,
      growing: furnishing.growthDays !== null && stage < GROWTH_STAGES - 1,
    });
  }

  return {
    id: scene.id,
    groundKey: scene.ground.key,
    groundName: scene.ground.name,
    groundDescription: scene.ground.description,
    artKey: scene.ground.artKey,
    airKey: scene.air.key,
    airName: scene.air.name,
    caption: scene.caption,
    position: scene.position,
    anchors: [...scene.ground.anchors]
      .sort((a, b) => a.depth - b.depth)
      .map((anchor) => ({
        key: anchor.key,
        label: anchor.label,
        maxSize: anchor.maxSize,
        x: anchor.x,
        y: anchor.y,
        depth: anchor.depth,
        standing: standing.get(anchor.key) ?? null,
      })),
  };
}

/** The owner's view: every scene, every air, and what ground is left. */
export async function getHollow(
  db: DbReader,
  { userId, now = new Date() }: { userId: string; now?: Date },
): Promise<HollowView | null> {
  const hollow = await db.hollow.findUnique({
    where: { userId },
    include: {
      scenes: { orderBy: { position: "asc" }, include: SCENE_INCLUDE },
      airGrants: { select: { airId: true } },
    },
  });
  if (!hollow) {
    return null;
  }

  const [allAirs, allGrounds, rung] = await Promise.all([
    db.hollowAirDefinition.findMany({ orderBy: { sortOrder: "asc" } }),
    db.hollowGroundDefinition.findMany({ orderBy: { sortOrder: "asc" } }),
    db.hollowGroundPrice.findUnique({
      where: { heldCount: hollow.scenes.length },
    }),
  ]);
  const heldAirs = new Set(hollow.airGrants.map((grant) => grant.airId));
  const heldGrounds = new Set(hollow.scenes.map((scene) => scene.groundId));

  return {
    sceneCount: hollow.scenes.length,
    scenes: hollow.scenes.map((scene) => composeScene(scene, now)),
    airs: allAirs.map((air) => ({
      key: air.key,
      name: air.name,
      description: air.description,
      price: coinsToJSON(air.price),
      held: heldAirs.has(air.id),
    })),
    grounds: allGrounds.map((ground) => ({
      key: ground.key,
      name: ground.name,
      description: ground.description,
      artKey: ground.artKey,
      held: heldGrounds.has(ground.id),
    })),
    nextGroundPrice: rung ? coinsToJSON(rung.price) : null,
  };
}

/**
 * A visitor's view of somebody else's Hollow. Same pictures, no controls,
 * and nothing about the owner's wallet, ground prices, or what they have
 * yet to buy.
 */
export async function getPublicHollow(
  db: DbReader,
  { username, now = new Date() }: { username: string; now?: Date },
): Promise<HollowSceneView[]> {
  const hollow = await db.hollow.findFirst({
    where: {
      user: {
        normalizedUsername: normalizeUsername(username),
        deactivatedAt: null,
      },
    },
    include: {
      scenes: { orderBy: { position: "asc" }, include: SCENE_INCLUDE },
    },
  });
  if (!hollow) {
    return [];
  }
  return hollow.scenes.map((scene) => composeScene(scene, now));
}

export interface CatalogueEntry {
  itemId: string;
  slug: string;
  name: string;
  description: string;
  artKey: string;
  size: string;
  /** Serialized coins. */
  price: string;
  growthDays: number | null;
  /** How many the player owns. Zero is an ordinary state, not a gap. */
  owned: number;
  /** How many of those are standing somewhere right now. */
  placed: number;
}

/**
 * Furnishings and what the player has of each.
 *
 * `admits` decides which lifecycles belong in the answer, because the two
 * callers want opposite things and getting that backwards is how a
 * moderation kill switch stops working. Buying asks for `isDistributable`
 * (ACTIVE only). Arranging asks for `isUsable` (ACTIVE or RETIRED) —
 * RETIRED means "no new copies", never "the copies you own are frozen".
 */
async function listFurnishings(
  db: DbReader,
  {
    userId,
    admits,
    tag,
  }: {
    userId: string;
    admits: (lifecycle: ItemLifecycle) => boolean;
    tag?: string;
  },
): Promise<CatalogueEntry[]> {
  const furnishings = await db.furnishing.findMany({
    include: { item: { include: { tags: { select: { slug: true } } } } },
  });
  const eligible = furnishings.filter(
    (row) =>
      admits(row.item.lifecycle) &&
      (tag === undefined || row.item.tags.some((each) => each.slug === tag)),
  );

  const [owned, placed] = await Promise.all([
    db.inventoryEntry.findMany({
      where: { userId, itemId: { in: eligible.map((row) => row.itemId) } },
      select: { itemId: true, quantity: true },
    }),
    db.hollowPlacement.groupBy({
      by: ["itemId"],
      where: { scene: { hollow: { userId } } },
      _count: { _all: true },
    }),
  ]);
  const ownedBy = new Map(owned.map((row) => [row.itemId, row.quantity]));
  const placedBy = new Map(placed.map((row) => [row.itemId, row._count._all]));

  return eligible
    .map((row) => ({
      itemId: row.itemId,
      slug: row.item.slug,
      name: row.item.name,
      description: row.item.description,
      artKey: row.item.artKey,
      size: row.size,
      price: coinsToJSON(row.item.price),
      growthDays: row.growthDays,
      owned: ownedBy.get(row.itemId) ?? 0,
      placed: placedBy.get(row.itemId) ?? 0,
    }))
    .sort((a, b) => {
      const byPrice = BigInt(a.price) - BigInt(b.price);
      if (byPrice !== 0n) return byPrice < 0n ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * The furnishings catalogue — what is for sale.
 *
 * Ordered by price ascending and nothing else. There is no "new", no
 * "featured", no rarity, and no owned/total — the only question the
 * catalogue answers is "what does this cost", because that is the only
 * question that has an honest answer for everybody.
 */
export async function listCatalogue(
  db: DbReader,
  { userId, tag }: { userId: string; tag?: string },
): Promise<CatalogueEntry[]> {
  return listFurnishings(db, { userId, admits: isDistributable, tag });
}

/**
 * What the player owns that could stand at a given anchor, and how many of
 * each are still spare. This is the only list the placement sheet shows.
 */
export async function listPlaceable(
  db: DbReader,
  { userId, maxSize }: { userId: string; maxSize: string },
): Promise<Array<CatalogueEntry & { spare: number }>> {
  const entries = await listFurnishings(db, { userId, admits: isUsable });
  return entries
    .filter(
      (entry) => entry.owned > entry.placed && sizeFits(entry.size, maxSize),
    )
    .map((entry) => ({ ...entry, spare: entry.owned - entry.placed }));
}
