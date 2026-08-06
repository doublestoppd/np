import type { ItemLifecycle, WordDifficulty } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { EconomyError } from "@/server/modules/commerce/errors";
import { recordSecurityEvent } from "@/server/security/audit";
import { grantItem } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { executeRestock } from "@/server/modules/commerce/restocking/execute";
import { computeWindowStart } from "@/server/modules/commerce/restocking/schedule";
import { planRestock } from "@/server/modules/commerce/restocking/plan";
import { deactivateAccount } from "@/server/modules/accounts/commands/deactivate-account";
import { assertGameDate, currentGameDate } from "@/server/modules/daily/game-day";
import {
  importAnswerWords,
  importGuessWords,
  setWordActive,
} from "@/server/modules/daily/word/words";
import {
  previewPuzzles,
  regenerateFuturePuzzle,
  setFuturePuzzleReward,
} from "@/server/modules/daily/word/puzzles";

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
    select: { isAdmin: true },
  });
  if (!user?.isAdmin) {
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

/** Lifecycle transitions replace deletion (docs/conventions.md). */
export async function setItemLifecycle(
  db: DbClient,
  actorId: AdminActor,
  { slug, lifecycle }: { slug: string; lifecycle: ItemLifecycle },
): Promise<void> {
  await assertAdmin(db, actorId);
  await db.item.update({ where: { slug }, data: { lifecycle } });
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
    if (listing.itemInstanceId) {
      await tx.itemInstance.updateMany({
        where: { id: listing.itemInstanceId, status: "ESCROWED" },
        data: { status: "OWNED" },
      });
    } else {
      await tx.inventoryEntry.upsert({
        where: {
          userId_itemId: { userId: listing.sellerId, itemId: listing.itemId },
        },
        create: {
          userId: listing.sellerId,
          itemId: listing.itemId,
          quantity: listing.quantity,
        },
        update: { quantity: { increment: listing.quantity } },
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

/** Imports accepted-guess dictionary words through the validated pipeline. */
export async function adminImportGuessWords(
  db: DbClient,
  actorId: AdminActor,
  { words }: { words: string[] },
) {
  await assertAdmin(db, actorId);
  const report = await importGuessWords(db, words);
  await audit(db, actorId, `Imported ${report.imported} guess words`, {
    submitted: report.submitted,
    imported: report.imported,
    rejected: report.rejected.length,
  });
  return report;
}

/** Imports or promotes answer-pool words (content review required). */
export async function adminImportAnswerWords(
  db: DbClient,
  actorId: AdminActor,
  { words, contentNotes }: { words: string[]; contentNotes: string },
) {
  await assertAdmin(db, actorId);
  const report = await importAnswerWords(db, words, contentNotes);
  await audit(db, actorId, `Imported ${report.imported} answer words`, {
    submitted: report.submitted,
    imported: report.imported,
    updated: report.updated,
    rejected: report.rejected.length,
  });
  return report;
}

/** Word kill switch: rejects it as a guess and excludes future answers. */
export async function adminSetWordActive(
  db: DbClient,
  actorId: AdminActor,
  { word, active }: { word: string; active: boolean },
): Promise<void> {
  await assertAdmin(db, actorId);
  const found = await setWordActive(db, word, active);
  if (!found) {
    throw new EconomyError("ITEM_NOT_FOUND");
  }
  await audit(db, actorId, `Word ${word} set active=${active}`, { active });
}

/** Previews a date's answers without exposing them publicly. */
export async function adminPreviewPuzzles(
  db: DbClient,
  actorId: AdminActor,
  { gameDate }: { gameDate: string },
) {
  await assertAdmin(db, actorId);
  await audit(db, actorId, `Previewed puzzles for ${gameDate}`, { gameDate });
  return previewPuzzles(db, assertGameDate(gameDate));
}

/** Regenerates a future, unplayed puzzle after a content fix. */
export async function adminRegeneratePuzzle(
  db: DbClient,
  actorId: AdminActor,
  { gameDate, difficulty }: { gameDate: string; difficulty: WordDifficulty },
) {
  await assertAdmin(db, actorId);
  const puzzle = await regenerateFuturePuzzle(db, {
    gameDate: assertGameDate(gameDate),
    difficulty,
    today: currentGameDate(),
  });
  await audit(db, actorId, `Regenerated puzzle ${gameDate}/${difficulty}`, {
    gameDate,
    difficulty,
    generationVersion: puzzle.generationVersion,
  });
  return { generationVersion: puzzle.generationVersion };
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
  if (totalWeight !== 10_000) {
    problems.push(`active weights sum to ${totalWeight}, expected 10000`);
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
