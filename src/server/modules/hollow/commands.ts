import type { DbClient, DbTx } from "@/server/db";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { coinsToJSON } from "@/lib/money";
import { debitCoins } from "../commerce/wallet";
import { recordLedger } from "../commerce/ledger";
import { grantItem } from "../items/ownership";
import { isUsable } from "../items/lifecycle";
import { CAPTION_MAX, enforceHollowRateLimit, sizeFits } from "./config";
import { HollowError } from "./errors";

/**
 * Everything that changes a Hollow.
 *
 * Two shapes recur, both borrowed from parts of the codebase that already
 * had to solve them:
 *
 * - **Arranging is serialized per player** with a transaction advisory
 *   lock, the same mechanism showcase reordering and player-shop listings
 *   use. A scene has no single row to guard with a precondition, and every
 *   arrange command is a read-modify-write over the whole scene.
 * - **Buying goes through the ordinary economy**: wallet debit, ledger row,
 *   idempotency key, all in one transaction. A furnishing is bought the
 *   same way anything else is; there is no separate money path.
 */

/**
 * Furnishings a new Hollow opens with, so it is never bare on day one.
 *
 * Exported so offline content validation can assert the slugs still exist
 * and are furnishings — CLAUDE.md permits renaming content slugs, and
 * without the check a rename would silently open every new Hollow with two
 * pieces instead of three, forever, with nothing failing.
 */
export const OPENING_FURNISHINGS = [
  "steadying-stone",
  "kettle-on-a-hook",
  "upturned-crate",
] as const;

async function lockHollow(tx: DbTx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"hollow:" + userId}))`;
}

/**
 * Opens a player's Hollow if it is not open yet, and returns its id.
 *
 * A new Hollow arrives with the first ground, the free air, and three
 * things already standing in it. That last part is deliberate: an empty
 * eight-anchor picture reads as a chore list, and three worn objects read
 * as somewhere that has been lived in and is waiting for you to carry on.
 */
export async function ensureHollow(
  db: DbClient,
  userId: string,
): Promise<string> {
  const existing = await db.hollow.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  return db.$transaction(async (tx) => {
    await lockHollow(tx, userId);
    const already = await tx.hollow.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (already) {
      return already.id;
    }

    const ground = await tx.hollowGroundDefinition.findFirst({
      orderBy: { sortOrder: "asc" },
      include: { anchors: { orderBy: { depth: "asc" } } },
    });
    const air = await tx.hollowAirDefinition.findFirst({
      where: { price: 0n },
      orderBy: { sortOrder: "asc" },
    });
    if (!ground || !air) {
      throw new HollowError("UNKNOWN_GROUND");
    }

    const hollow = await tx.hollow.create({ data: { userId } });
    await tx.hollowAirGrant.create({
      data: { hollowId: hollow.id, airId: air.id },
    });
    const scene = await tx.hollowScene.create({
      data: {
        hollowId: hollow.id,
        groundId: ground.id,
        airId: air.id,
        position: 0,
      },
    });

    const found = await tx.item.findMany({
      where: { slug: { in: [...OPENING_FURNISHINGS] } },
      include: { furnishing: true },
    });
    // Authored order, not whatever Postgres returned: which piece lands
    // where should be a decision somebody made, and it is the difference
    // between a composed opening and a shuffled one.
    const opening = OPENING_FURNISHINGS.map((slug) =>
      found.find((item) => item.slug === slug),
    ).filter((item) => item !== undefined);

    // Anchors are taken smallest-first from the front of the picture, so
    // the opening pieces sit where a person would actually put down a
    // stone and a kettle rather than dominating the middle distance.
    const spots = ground.anchors
      .filter((anchor) => anchor.maxSize === "SMALL")
      .sort((a, b) => b.depth - a.depth);
    for (const [index, item] of opening.entries()) {
      const anchor = spots[index];
      if (!anchor || !item.furnishing) continue;
      if (!sizeFits(item.furnishing.size, anchor.maxSize)) continue;
      // The ledger row is not optional because the grant is free. Every
      // item entering circulation is accounted for (docs/conventions.md),
      // and without this the three opening pieces were 680 coins of
      // catalogue value appearing in a satchel with nothing to explain
      // them — not in /history, not in reconciliation. This mirrors what
      // chooseStarter does for the starter pack.
      const ledger = await recordLedger(tx, {
        userId,
        type: "STARTER_GRANT",
        itemId: item.id,
        quantity: 1,
        note: `${item.name}, already standing in your Hollow`,
        metadata: { source: "hollow:opening" },
      });
      await grantItem(tx, {
        userId,
        item,
        quantity: 1,
        reason: "distribution",
        source: "hollow:opening",
        transactionId: ledger.id,
      });
      await tx.hollowPlacement.create({
        data: { sceneId: scene.id, anchorKey: anchor.key, itemId: item.id },
      });
    }

    return hollow.id;
  });
}

/** Loads the caller's scene, or refuses. Never trusts a scene id alone. */
async function ownedScene(tx: DbTx, userId: string, sceneId: string) {
  const scene = await tx.hollowScene.findFirst({
    where: { id: sceneId, hollow: { userId } },
    include: { ground: { include: { anchors: true } }, hollow: true },
  });
  if (!scene) {
    throw new HollowError("SCENE_NOT_FOUND");
  }
  return scene;
}

export interface FurnishingPurchaseResult {
  [key: string]: string | number;
  slug: string;
  /** Display name, so the notice reads like every other shop's. */
  name: string;
  quantity: number;
  /** Serialized coins spent. */
  spent: string;
}

/**
 * Buys furnishings at the catalogue price.
 *
 * There is no stock and no restock: the same object is buyable by anybody,
 * at the same price, forever. That is what makes owning five of something
 * a sane thing to want, and it is what makes another player's Hollow
 * something to ask about rather than something to envy.
 */
export async function purchaseFurnishing(
  db: DbClient,
  {
    userId,
    slug,
    quantity,
    idempotencyKey,
  }: {
    userId: string;
    slug: string;
    quantity: number;
    idempotencyKey: string;
  },
): Promise<{ result: FurnishingPurchaseResult; replayed: boolean }> {
  await enforceHollowRateLimit(db, "hollow-purchase", userId);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new HollowError("INVALID_QUANTITY");
  }

  return withIdempotency<FurnishingPurchaseResult>(
    db,
    {
      userId,
      operation: "hollow-furnishing",
      key: idempotencyKey,
      requestHash: requestHash({ slug, quantity }),
    },
    async (tx) => {
      const item = await tx.item.findUnique({
        where: { slug },
        include: { furnishing: true },
      });
      if (!item || !item.furnishing || item.lifecycle !== "ACTIVE") {
        throw new HollowError("UNKNOWN_FURNISHING");
      }
      const total = item.price * BigInt(quantity);
      await debitCoins(tx, { userId, amount: total });
      const ledger = await recordLedger(tx, {
        userId,
        type: "FURNISHING_PURCHASE",
        itemId: item.id,
        quantity,
        coinsDelta: -total,
        note: `Bought ${quantity}x ${item.name} for the Hollow`,
        metadata: { slug: item.slug, unitPrice: coinsToJSON(item.price) },
      });
      await grantItem(tx, {
        userId,
        item,
        quantity,
        reason: "distribution",
        source: "hollow:catalogue",
        transactionId: ledger.id,
      });
      return {
        slug: item.slug,
        name: item.name,
        quantity,
        spent: coinsToJSON(total),
      };
    },
  );
}

export interface GroundPurchaseResult {
  [key: string]: string | number;
  groundKey: string;
  /** Display name, so the notice does not print a slug at the player. */
  name: string;
  /** Serialized coins spent. */
  spent: string;
  sceneCount: number;
}

/**
 * Buys another ground.
 *
 * The price comes from how many you already hold, never from which picture
 * you pick — so choosing a ground is only ever an aesthetic choice, and no
 * ground is "the good one".
 */
export async function purchaseGround(
  db: DbClient,
  {
    userId,
    groundKey,
    idempotencyKey,
  }: { userId: string; groundKey: string; idempotencyKey: string },
): Promise<{ result: GroundPurchaseResult; replayed: boolean }> {
  await enforceHollowRateLimit(db, "hollow-purchase", userId);
  const hollowId = await ensureHollow(db, userId);

  return withIdempotency<GroundPurchaseResult>(
    db,
    {
      userId,
      operation: "hollow-ground",
      key: idempotencyKey,
      requestHash: requestHash({ groundKey }),
    },
    async (tx) => {
      await lockHollow(tx, userId);
      const ground = await tx.hollowGroundDefinition.findUnique({
        where: { key: groundKey },
      });
      if (!ground) {
        throw new HollowError("UNKNOWN_GROUND");
      }
      const scenes = await tx.hollowScene.findMany({
        where: { hollowId },
        select: { groundId: true },
      });
      if (scenes.some((scene) => scene.groundId === ground.id)) {
        throw new HollowError("GROUND_ALREADY_HELD");
      }
      const rung = await tx.hollowGroundPrice.findUnique({
        where: { heldCount: scenes.length },
      });
      if (!rung) {
        throw new HollowError("NO_GROUNDS_LEFT");
      }

      // Whatever air the player last chose is the sensible default for a
      // new ground: they bought that light because they like it.
      const lastScene = await tx.hollowScene.findFirst({
        where: { hollowId },
        orderBy: { position: "desc" },
        select: { airId: true },
      });
      const airId =
        lastScene?.airId ??
        (
          await tx.hollowAirDefinition.findFirstOrThrow({
            where: { price: 0n },
            orderBy: { sortOrder: "asc" },
            select: { id: true },
          })
        ).id;

      if (rung.price > 0n) {
        await debitCoins(tx, { userId, amount: rung.price });
      }
      await recordLedger(tx, {
        userId,
        type: "HOLLOW_GROUND",
        coinsDelta: -rung.price,
        note: `Took on ${ground.name}`,
        metadata: { groundKey: ground.key, price: coinsToJSON(rung.price) },
      });
      await tx.hollowScene.create({
        data: {
          hollowId,
          groundId: ground.id,
          airId,
          position: scenes.length,
        },
      });
      return {
        groundKey: ground.key,
        name: ground.name,
        spent: coinsToJSON(rung.price),
        sceneCount: scenes.length + 1,
      };
    },
  );
}

export interface AirPurchaseResult {
  [key: string]: string;
  airKey: string;
  /** Serialized coins spent. */
  spent: string;
}

/**
 * Buys an air.
 *
 * The one purchase in the game that makes things you already own worth
 * more: an air is account-wide and free to switch, so it repaints every
 * ground and re-lights every furnishing bought before it and after it.
 */
export async function purchaseAir(
  db: DbClient,
  {
    userId,
    airKey,
    idempotencyKey,
  }: { userId: string; airKey: string; idempotencyKey: string },
): Promise<{ result: AirPurchaseResult; replayed: boolean }> {
  await enforceHollowRateLimit(db, "hollow-purchase", userId);
  const hollowId = await ensureHollow(db, userId);

  return withIdempotency<AirPurchaseResult>(
    db,
    {
      userId,
      operation: "hollow-air",
      key: idempotencyKey,
      requestHash: requestHash({ airKey }),
    },
    async (tx) => {
      await lockHollow(tx, userId);
      const air = await tx.hollowAirDefinition.findUnique({
        where: { key: airKey },
      });
      if (!air) {
        throw new HollowError("UNKNOWN_AIR");
      }
      const held = await tx.hollowAirGrant.findUnique({
        where: { hollowId_airId: { hollowId, airId: air.id } },
      });
      if (held) {
        throw new HollowError("AIR_ALREADY_HELD");
      }
      if (air.price > 0n) {
        await debitCoins(tx, { userId, amount: air.price });
      }
      await recordLedger(tx, {
        userId,
        type: "HOLLOW_AIR",
        coinsDelta: -air.price,
        note: `Bought the ${air.name} air`,
        metadata: { airKey: air.key, price: coinsToJSON(air.price) },
      });
      await tx.hollowAirGrant.create({ data: { hollowId, airId: air.id } });
      return { airKey: air.key, spent: coinsToJSON(air.price) };
    },
  );
}

/**
 * Stands a furnishing at an anchor.
 *
 * A furnishing may stand in as many places as you own copies of it, which
 * is checked here against the live placement count rather than trusted
 * from anywhere — the count and the ownership read both happen inside the
 * writing transaction, under the same lock the rest of arranging uses.
 */
export async function placeFurnishing(
  db: DbClient,
  {
    userId,
    sceneId,
    anchorKey,
    slug,
    now = new Date(),
  }: {
    userId: string;
    sceneId: string;
    anchorKey: string;
    slug: string;
    now?: Date;
  },
): Promise<void> {
  await enforceHollowRateLimit(db, "hollow-arrange", userId);
  await db.$transaction(async (tx) => {
    await lockHollow(tx, userId);
    const scene = await ownedScene(tx, userId, sceneId);
    const anchor = scene.ground.anchors.find((each) => each.key === anchorKey);
    if (!anchor) {
      throw new HollowError("UNKNOWN_ANCHOR");
    }
    const taken = await tx.hollowPlacement.findUnique({
      where: { sceneId_anchorKey: { sceneId, anchorKey } },
    });
    if (taken) {
      throw new HollowError("ANCHOR_TAKEN");
    }
    const item = await tx.item.findUnique({
      where: { slug },
      include: { furnishing: true },
    });
    // RETIRED furnishings the player already owns may still be arranged —
    // retirement stops new copies, it does not freeze the ones people
    // bought. DISABLED is the moderation kill switch and stops everything.
    if (!item?.furnishing || !isUsable(item.lifecycle)) {
      throw new HollowError("UNKNOWN_FURNISHING");
    }
    if (!sizeFits(item.furnishing.size, anchor.maxSize)) {
      throw new HollowError("DOES_NOT_FIT");
    }
    const owned = await tx.inventoryEntry.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
      select: { quantity: true },
    });
    if (!owned || owned.quantity < 1) {
      throw new HollowError("NOT_OWNED");
    }
    const placed = await tx.hollowPlacement.count({
      where: { itemId: item.id, scene: { hollow: { userId } } },
    });
    if (placed >= owned.quantity) {
      throw new HollowError("ALL_COPIES_PLACED");
    }
    await tx.hollowPlacement.create({
      data: { sceneId, anchorKey, itemId: item.id, plantedAt: now },
    });
  });
}

/**
 * Takes a furnishing back out of the picture.
 *
 * A growing furnishing loses its clock when it comes out — a tree
 * remembers where it was planted, and digging it up starts it over. That
 * is why `moveFurnishing` exists: rearranging must never cost the player
 * two months.
 */
export async function clearAnchor(
  db: DbClient,
  { userId, sceneId, anchorKey }: { userId: string; sceneId: string; anchorKey: string },
): Promise<void> {
  await enforceHollowRateLimit(db, "hollow-arrange", userId);
  await db.$transaction(async (tx) => {
    await lockHollow(tx, userId);
    await ownedScene(tx, userId, sceneId);
    const removed = await tx.hollowPlacement.deleteMany({
      where: { sceneId, anchorKey },
    });
    if (removed.count === 0) {
      throw new HollowError("ANCHOR_EMPTY");
    }
  });
}

/** Moves a standing furnishing to another anchor, keeping its clock. */
export async function moveFurnishing(
  db: DbClient,
  {
    userId,
    fromSceneId,
    fromAnchorKey,
    toSceneId,
    toAnchorKey,
  }: {
    userId: string;
    fromSceneId: string;
    fromAnchorKey: string;
    toSceneId: string;
    toAnchorKey: string;
  },
): Promise<void> {
  await enforceHollowRateLimit(db, "hollow-arrange", userId);
  await db.$transaction(async (tx) => {
    await lockHollow(tx, userId);
    const from = await ownedScene(tx, userId, fromSceneId);
    const target = await ownedScene(tx, userId, toSceneId);
    const anchor = target.ground.anchors.find((each) => each.key === toAnchorKey);
    if (!anchor) {
      throw new HollowError("UNKNOWN_ANCHOR");
    }
    const placement = await tx.hollowPlacement.findUnique({
      where: { sceneId_anchorKey: { sceneId: fromSceneId, anchorKey: fromAnchorKey } },
      include: { item: { include: { furnishing: true } } },
    });
    if (!placement) {
      throw new HollowError("ANCHOR_EMPTY");
    }
    if (fromSceneId === toSceneId && fromAnchorKey === toAnchorKey) {
      return;
    }
    if (!placement.item.furnishing || !isUsable(placement.item.lifecycle)) {
      throw new HollowError("UNKNOWN_FURNISHING");
    }
    if (!sizeFits(placement.item.furnishing.size, anchor.maxSize)) {
      throw new HollowError("DOES_NOT_FIT");
    }
    const occupant = await tx.hollowPlacement.findUnique({
      where: { sceneId_anchorKey: { sceneId: toSceneId, anchorKey: toAnchorKey } },
      include: { item: { include: { furnishing: true } } },
    });
    if (occupant) {
      // A swap, not a refusal: dragging one thing onto another is the
      // natural way to trade two positions, and refusing would make the
      // player empty a spot first and lose that piece's clock.
      // The moving piece already passed its size check against the target
      // anchor above; the occupant has to pass the mirror check, because a
      // swap moves it the other way.
      const other = occupant.item.furnishing;
      const sourceAnchor = from.ground.anchors.find(
        (each) => each.key === fromAnchorKey,
      );
      if (!other || !sourceAnchor || !sizeFits(other.size, sourceAnchor.maxSize)) {
        throw new HollowError("DOES_NOT_FIT");
      }
      // Delete both, then recreate: the (sceneId, anchorKey) unique index
      // makes an in-place swap impossible without a transient collision.
      await tx.hollowPlacement.deleteMany({
        where: { id: { in: [placement.id, occupant.id] } },
      });
      await tx.hollowPlacement.createMany({
        data: [
          {
            sceneId: toSceneId,
            anchorKey: toAnchorKey,
            itemId: placement.itemId,
            plantedAt: placement.plantedAt,
          },
          {
            sceneId: fromSceneId,
            anchorKey: fromAnchorKey,
            itemId: occupant.itemId,
            plantedAt: occupant.plantedAt,
          },
        ],
      });
      return;
    }
    await tx.hollowPlacement.update({
      where: { id: placement.id },
      data: { sceneId: toSceneId, anchorKey: toAnchorKey },
    });
  });
}

/** Applies one of the player's airs to one of their grounds. */
export async function setSceneAir(
  db: DbClient,
  { userId, sceneId, airKey }: { userId: string; sceneId: string; airKey: string },
): Promise<void> {
  await enforceHollowRateLimit(db, "hollow-arrange", userId);
  await db.$transaction(async (tx) => {
    await lockHollow(tx, userId);
    const scene = await ownedScene(tx, userId, sceneId);
    const air = await tx.hollowAirDefinition.findUnique({ where: { key: airKey } });
    if (!air) {
      throw new HollowError("UNKNOWN_AIR");
    }
    const held = await tx.hollowAirGrant.findUnique({
      where: { hollowId_airId: { hollowId: scene.hollowId, airId: air.id } },
    });
    if (!held) {
      throw new HollowError("AIR_NOT_HELD");
    }
    await tx.hollowScene.update({
      where: { id: sceneId },
      data: { airId: air.id },
    });
  });
}

/** Sets the plain-text line a visitor reads under a ground. */
export async function setSceneCaption(
  db: DbClient,
  { userId, sceneId, caption }: { userId: string; sceneId: string; caption: string },
): Promise<void> {
  await enforceHollowRateLimit(db, "hollow-arrange", userId);
  const trimmed = caption.trim();
  if (trimmed.length > CAPTION_MAX) {
    throw new HollowError("CAPTION_TOO_LONG");
  }
  await db.$transaction(async (tx) => {
    await lockHollow(tx, userId);
    await ownedScene(tx, userId, sceneId);
    await tx.hollowScene.update({
      where: { id: sceneId },
      data: { caption: trimmed },
    });
  });
}

/**
 * Moves a ground one step earlier or later in the order a visitor walks
 * through. Moving past either end is a harmless no-op.
 */
export async function moveScene(
  db: DbClient,
  {
    userId,
    sceneId,
    direction,
  }: { userId: string; sceneId: string; direction: "up" | "down" },
): Promise<void> {
  await enforceHollowRateLimit(db, "hollow-arrange", userId);
  await db.$transaction(async (tx) => {
    await lockHollow(tx, userId);
    const scene = await ownedScene(tx, userId, sceneId);
    const scenes = await tx.hollowScene.findMany({
      where: { hollowId: scene.hollowId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const index = scenes.findIndex((each) => each.id === sceneId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= scenes.length) {
      return;
    }
    const order = scenes.map((each) => each.id);
    const moved = order[index] as string;
    order[index] = order[target] as string;
    order[target] = moved;

    // Positions are unique per Hollow and CHECK-constrained non-negative,
    // so the whole list is parked far above any real order and rewritten,
    // rather than swapped in place. Deleting and recreating — the trick the
    // showcase uses — would take the placements down with the scenes.
    const PARK = 1_000_000;
    for (const [offset, id] of order.entries()) {
      await tx.hollowScene.update({
        where: { id },
        data: { position: PARK + offset },
      });
    }
    for (const [position, id] of order.entries()) {
      await tx.hollowScene.update({ where: { id }, data: { position } });
    }
  });
}
