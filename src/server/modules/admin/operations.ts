import type { ItemLifecycle, WordDifficulty } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { isAdmin } from "@/lib/roles";
import { EconomyError } from "@/server/modules/commerce/errors";
import { recordSecurityEvent } from "@/server/security/audit";
import { grantItem, releaseInstance } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { executeRestock } from "@/server/modules/commerce/restocking/execute";
import { computeWindowStart } from "@/server/modules/commerce/restocking/schedule";
import { planRestock } from "@/server/modules/commerce/restocking/plan";
import { WHEEL_TOTAL_WEIGHT } from "@/server/modules/daily/wheel/spin";
import { deactivateAccount } from "@/server/modules/accounts/commands/deactivate-account";
import { assertGameDate, currentGameDate } from "@/server/modules/daily/game-day";
import { ROTATION_BANDS } from "@/server/modules/daily/bands";
import {
  previewPuzzles,
  regenerateFuturePuzzle,
  setFuturePuzzleReward,
} from "@/server/modules/daily/word/puzzles";
import { bandForUser } from "@/server/modules/daily/bands";

/**
 * Role-gated administrative operations (docs/operations.md). Every action
 * disables rather than deletes, so ledger/restock/listing/provenance
 * history survives. `actorId` is either an admin user's id or the literal
 * "cli" when invoked by an operator through scripts/admin-cli.ts (which
 * already implies database-level access).
 */

export type AdminActor = string;

async function assertAdmin(db: DbClient, actorId: AdminActor): Promise<void> {
  if (actorId === "cli") {
    return;
  }
  const user = await db.user.findUnique({
    where: { id: actorId },
    select: { role: true },
  });
  // Everything in this module touches coins, item lifecycle, or accounts,
  // so it is ADMIN and not merely "privileged" — a moderator deliberately
  // fails here (src/lib/roles.ts).
  if (!user || !isAdmin(user.role)) {
    throw new EconomyError("NOT_AUTHORIZED");
  }
}

async function audit(
  db: DbClient,
  actorId: AdminActor,
  message: string,
  metadata?: Record<string, string | number | boolean>,
): Promise<void> {
  await recordSecurityEvent(db, {
    userId: actorId === "cli" ? null : actorId,
    type: "admin-action",
    severity: "info",
    message,
    metadata,
  });
}

/**
 * Lifecycle transitions replace deletion (docs/conventions.md).
 *
 * The transition stamps `releasedAt` and `retiredAt`, which are the only
 * record of WHEN an item entered or left circulation — an operator asking
 * "how long was this buyable" has nothing else to read. Both are set once
 * and never cleared: a re-released item keeps the date it was first
 * retired, because that is what happened.
 */
export async function setItemLifecycle(
  db: DbClient,
  actorId: AdminActor,
  { slug, lifecycle, now = new Date() }: {
    slug: string;
    lifecycle: ItemLifecycle;
    now?: Date;
  },
): Promise<void> {
  await assertAdmin(db, actorId);
  const current = await db.item.findUniqueOrThrow({
    where: { slug },
    select: { releasedAt: true, retiredAt: true },
  });
  await db.item.update({
    where: { slug },
    data: {
      lifecycle,
      releasedAt:
        lifecycle === "ACTIVE" && current.releasedAt === null ? now : undefined,
      retiredAt:
        lifecycle === "RETIRED" && current.retiredAt === null ? now : undefined,
    },
  });
  await audit(db, actorId, `Item ${slug} lifecycle set to ${lifecycle}`, {
    slug,
    lifecycle,
  });
}

export async function setNpcShopActive(
  db: DbClient,
  actorId: AdminActor,
  { slug, active }: { slug: string; active: boolean },
): Promise<void> {
  await assertAdmin(db, actorId);
  await db.npcShop.update({ where: { slug }, data: { active } });
  await audit(db, actorId, `NPC shop ${slug} set active=${active}`, { slug, active });
}

export async function setPlayerShopActive(
  db: DbClient,
  actorId: AdminActor,
  { slug, active }: { slug: string; active: boolean },
): Promise<void> {
  await assertAdmin(db, actorId);
  await db.playerShop.update({ where: { slug }, data: { active } });
  await audit(db, actorId, `Player shop ${slug} set active=${active}`, { slug, active });
}

/** Disables a listing without deleting it; returns escrow to the seller. */
export async function disablePlayerListing(
  db: DbClient,
  actorId: AdminActor,
  { listingId }: { listingId: string },
): Promise<void> {
  await assertAdmin(db, actorId);
  await db.$transaction(async (tx) => {
    const claimed = await tx.playerShopListing.updateMany({
      where: { id: listingId, status: "ACTIVE" },
      data: { status: "DISABLED" },
    });
    if (claimed.count === 0) {
      throw new EconomyError("LISTING_NOT_ACTIVE");
    }
    const listing = await tx.playerShopListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    // Every item movement writes its ledger row in the same transaction
    // (docs/conventions.md — economy invariants). Without this the
    // seller's history showed the listing but never its return.
    const ledgerEntry = await recordLedger(tx, {
      userId: listing.sellerId,
      type: "PLAYER_LISTING_CANCEL",
      itemId: listing.itemId,
      itemInstanceId: listing.itemInstanceId,
      playerListingId: listing.id,
      quantity: listing.quantity,
      note: "Listing disabled by an administrator; escrow returned",
    });
    // Escrow returns through the ownership boundary, which raises on an
    // unexpected instance state instead of silently stranding the item.
    if (listing.itemInstanceId) {
      await releaseInstance(tx, {
        userId: listing.sellerId,
        instanceId: listing.itemInstanceId,
      });
    } else {
      const item = await tx.item.findUniqueOrThrow({
        where: { id: listing.itemId },
      });
      await grantItem(tx, {
        userId: listing.sellerId,
        item,
        quantity: listing.quantity,
        // Escrow coming home. The item may well be the reason the listing
        // was disabled, so its lifecycle must not block the return.
        reason: "restoration",
        source: "admin:listing-disabled",
        transactionId: ledgerEntry.id,
      });
    }
  });
  await audit(db, actorId, `Listing ${listingId} disabled; escrow returned`, {
    listingId,
  });
}

export async function setUserCommerceDisabled(
  db: DbClient,
  actorId: AdminActor,
  { username, disabled }: { username: string; disabled: boolean },
): Promise<void> {
  await assertAdmin(db, actorId);
  await db.user.update({
    where: { username },
    data: { commerceDisabledAt: disabled ? new Date() : null },
  });
  await audit(db, actorId, `Commerce ${disabled ? "disabled" : "enabled"} for ${username}`, {
    username,
    disabled,
  });
}

/** Soft account deactivation (see accounts/commands/deactivate-account). */
export async function adminDeactivateAccount(
  db: DbClient,
  actorId: AdminActor,
  { username, reason }: { username: string; reason: string },
): Promise<void> {
  await assertAdmin(db, actorId);
  const user = await db.user.findUniqueOrThrow({ where: { username } });
  await deactivateAccount(db, { userId: user.id, reason });
  await audit(db, actorId, `Account ${username} deactivated (${reason})`, {
    username,
  });
}

/** Grants items with a ledger record (compensation, testing, events). */
export async function adminGrantItem(
  db: DbClient,
  actorId: AdminActor,
  { username, itemSlug, quantity }: { username: string; itemSlug: string; quantity: number },
): Promise<void> {
  await assertAdmin(db, actorId);
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { username } });
    const item = await tx.item.findUniqueOrThrow({ where: { slug: itemSlug } });
    const ledger = await recordLedger(tx, {
      userId: user.id,
      type: "ADMIN_ADJUST",
      itemId: item.id,
      quantity,
      note: `Administrative grant of ${quantity} × ${item.name}`,
    });
    await grantItem(tx, {
      userId: user.id,
      item,
      quantity,
      // Operator adjustment with an audit trail (compensation, testing);
      // deliberately not bound by distribution policy.
      reason: "restoration",
      source: "admin-grant",
      transactionId: ledger.id,
    });
  });
  await audit(db, actorId, `Granted ${quantity} × ${itemSlug} to ${username}`, {
    username,
    itemSlug,
    quantity,
  });
}

export async function adminGrantCoins(
  db: DbClient,
  actorId: AdminActor,
  { username, amount }: { username: string; amount: bigint },
): Promise<void> {
  await assertAdmin(db, actorId);
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { username } });
    await creditCoins(tx, { userId: user.id, amount });
    await recordLedger(tx, {
      userId: user.id,
      type: "ADMIN_ADJUST",
      coinsDelta: amount,
      note: `Administrative coin grant`,
    });
  });
  await audit(db, actorId, `Granted ${amount.toString()} coins to ${username}`, {
    username,
    amount: amount.toString(),
  });
}

/** Deterministic dry-run of a shop's restock for a window (no writes). */
export async function previewRestock(
  db: DbClient,
  actorId: AdminActor,
  { shopSlug, at = new Date() }: { shopSlug: string; at?: Date },
) {
  await assertAdmin(db, actorId);
  const shop = await db.npcShop.findUniqueOrThrow({
    where: { slug: shopSlug },
    include: { restockConfig: true, poolEntries: { include: { item: true } } },
  });
  if (!shop.restockConfig) {
    throw new EconomyError("INVALID_RESTOCK_CONFIG");
  }
  const windowStart = computeWindowStart(shop.restockConfig, at);
  if (!windowStart) {
    throw new EconomyError("INVALID_RESTOCK_CONFIG");
  }
  const plan = planRestock({
    shopId: shop.id,
    windowStart,
    config: shop.restockConfig,
    poolEntries: shop.poolEntries,
  });
  return {
    windowStart,
    plan: {
      ...plan,
      listings: plan.listings.map((listing) => ({
        ...listing,
        price: listing.price.toString(),
      })),
    },
  };
}

/** Executes (or replays, idempotently) a shop's restock for a window. */
export async function triggerRestock(
  db: DbClient,
  actorId: AdminActor,
  { shopSlug, at = new Date() }: { shopSlug: string; at?: Date },
) {
  await assertAdmin(db, actorId);
  const shop = await db.npcShop.findUniqueOrThrow({
    where: { slug: shopSlug },
    include: { restockConfig: true },
  });
  if (!shop.restockConfig) {
    throw new EconomyError("INVALID_RESTOCK_CONFIG");
  }
  const windowStart = computeWindowStart(shop.restockConfig, at);
  if (!windowStart) {
    throw new EconomyError("INVALID_RESTOCK_CONFIG");
  }
  const restock = await executeRestock(db, { shopId: shop.id, windowStart });
  await audit(db, actorId, `Restock triggered for ${shopSlug}`, {
    shopSlug,
    windowStart: windowStart.toISOString(),
  });
  return restock;
}

// ---------------------------------------------------------------------------
// Daily activities (Phase 4)
// ---------------------------------------------------------------------------

/** Rejects a band outside the configured rotation. */
function assertBand(band: number): void {
  if (!Number.isInteger(band) || band < 0 || band >= ROTATION_BANDS) {
    throw new DomainError(
      "INVALID_BAND",
      `Band must be a whole number from 0 to ${ROTATION_BANDS - 1}.`,
    );
  }
}

/**
 * Previews one rotation band's answers for a date, without exposing them
 * publicly. Band-scoped on purpose: the whole day's answers in one place
 * would be the leak the bands exist to prevent, arrived at by operator
 * convenience instead of by attack.
 */
export async function adminPreviewPuzzles(
  db: DbClient,
  actorId: AdminActor,
  { gameDate, band = 0 }: { gameDate: string; band?: number },
) {
  await assertAdmin(db, actorId);
  assertBand(band);
  await audit(db, actorId, `Previewed puzzles for ${gameDate} band ${band}`, {
    gameDate,
    band,
  });
  return previewPuzzles(db, assertGameDate(gameDate), band);
}

/** Regenerates a future, unplayed puzzle after a content fix. */
export async function adminRegeneratePuzzle(
  db: DbClient,
  actorId: AdminActor,
  {
    gameDate,
    difficulty,
    band = 0,
  }: { gameDate: string; difficulty: WordDifficulty; band?: number },
) {
  await assertAdmin(db, actorId);
  assertBand(band);
  await regenerateFuturePuzzle(db, {
    gameDate: assertGameDate(gameDate),
    difficulty,
    band,
    today: currentGameDate(),
  });
  await audit(
    db,
    actorId,
    `Regenerated puzzle ${gameDate}/${difficulty} band ${band}`,
    { gameDate, difficulty, band },
  );
  return { regenerated: true };
}

/**
 * The rotation band a player's account falls in. Support needs this to
 * preview the words a specific player is actually seeing; without it the
 * only way to answer "what did this player get?" would be dumping every
 * band, which is the leak the bands prevent.
 */
export async function adminLookupBand(
  db: DbClient,
  actorId: AdminActor,
  { username }: { username: string },
): Promise<{ username: string; band: number }> {
  await assertAdmin(db, actorId);
  const user = await db.user.findUniqueOrThrow({
    where: { username },
    select: { id: true },
  });
  const band = bandForUser(user.id);
  await audit(db, actorId, `Looked up word band for ${username}`, {
    username,
    band,
  });
  return { username, band };
}

/** Changes the reward for a future, unplayed puzzle. */
export async function adminSetPuzzleReward(
  db: DbClient,
  actorId: AdminActor,
  {
    gameDate,
    difficulty,
    rewardCoins,
  }: { gameDate: string; difficulty: WordDifficulty; rewardCoins: bigint },
): Promise<void> {
  await assertAdmin(db, actorId);
  await setFuturePuzzleReward(db, {
    gameDate: assertGameDate(gameDate),
    difficulty,
    rewardCoins,
    today: currentGameDate(),
  });
  await audit(
    db,
    actorId,
    `Set ${gameDate}/${difficulty} reward to ${rewardCoins.toString()}`,
    { gameDate, difficulty, rewardCoins: rewardCoins.toString() },
  );
}

/** Validates a wheel's active configuration and pool eligibility. */
export async function adminValidateWheel(
  db: DbClient,
  actorId: AdminActor,
  { wheelSlug }: { wheelSlug: string },
) {
  await assertAdmin(db, actorId);
  const wheel = await db.dailyWheel.findUniqueOrThrow({
    where: { slug: wheelSlug },
  });
  const configuration = await db.dailyWheelConfiguration.findFirst({
    where: { wheelId: wheel.id, active: true },
    orderBy: { version: "desc" },
    include: {
      prizes: {
        where: { active: true },
        include: {
          itemPool: { include: { entries: { include: { item: true } } } },
        },
      },
    },
  });
  if (!configuration) {
    return { ok: false, problems: ["no active configuration"] };
  }
  const problems: string[] = [];
  const totalWeight = configuration.prizes.reduce(
    (sum, prize) => sum + prize.weight,
    0,
  );
  if (totalWeight !== WHEEL_TOTAL_WEIGHT) {
    problems.push(
      `active weights sum to ${totalWeight}, expected ${WHEEL_TOTAL_WEIGHT}`,
    );
  }
  for (const prize of configuration.prizes) {
    if (prize.resultType === "ITEM_POOL") {
      const eligible =
        prize.itemPool?.entries.filter(
          (entry) => entry.active && isDistributable(entry.item.lifecycle),
        ) ?? [];
      if (eligible.length === 0) {
        problems.push(`prize "${prize.label}" has no eligible pool items`);
      }
    }
    if (prize.resultType === "COINS" && (prize.coinAmount ?? 0n) <= 0n) {
      problems.push(`prize "${prize.label}" has no coin amount`);
    }
  }
  return { ok: problems.length === 0, version: configuration.version, problems };
}

/** A player's recorded daily outcomes with their economy transactions. */
export async function adminInspectDaily(
  db: DbClient,
  actorId: AdminActor,
  { username, take = 20 }: { username: string; take?: number },
) {
  await assertAdmin(db, actorId);
  const user = await db.user.findUniqueOrThrow({ where: { username } });
  const [words, spins, claims] = await Promise.all([
    db.dailyWordResult.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        puzzle: { select: { gameDate: true, difficulty: true } },
        rewardTransaction: true,
      },
    }),
    db.dailyWheelSpin.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take,
      include: { prize: { select: { label: true } }, rewardTransaction: true },
    }),
    db.dailyFoodClaim.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        awardedItem: { select: { slug: true } },
        rewardTransaction: true,
      },
    }),
  ]);
  await audit(db, actorId, `Inspected daily activity for ${username}`, {
    username,
  });
  return {
    words: words.map((row) => ({
      gameDate: row.puzzle.gameDate,
      difficulty: row.puzzle.difficulty,
      status: row.status,
      attemptsUsed: row.attemptsUsed,
      rewardCoins: row.rewardCoins.toString(),
      transactionId: row.rewardTransactionId,
    })),
    spins: spins.map((row) => ({
      gameDate: row.gameDate,
      prize: row.prize.label,
      coins: row.awardedCoins.toString(),
      itemId: row.awardedItemId,
      quantity: row.awardedQuantity,
      transactionId: row.rewardTransactionId,
    })),
    meals: claims.map((row) => ({
      gameDate: row.gameDate,
      item: row.awardedItem.slug,
      quantity: row.awardedQuantity,
      transactionId: row.rewardTransactionId,
    })),
  };
}
