import type { DbClient } from "@/server/db";

/**
 * Read-only economy/ownership reconciliation (docs/operations.md). Detects
 * impossible or inconsistent states and REPORTS them — it never repairs
 * data. Repairs are explicit, audited admin operations.
 *
 * Wallet check: every coin mutation writes a ledger row in the same
 * transaction, so for any account:
 *   coins - sum(ledger coinsDelta) === STARTING_COINS
 */
export interface ReconciliationFinding {
  check: string;
  subject: string;
  detail: string;
}

const STARTING_COINS = 200n;

export async function runReconciliation(
  db: DbClient,
  { userIds }: { userIds?: string[] } = {},
): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = [];
  const userFilter = userIds ? { id: { in: userIds } } : {};
  const userIdFilter = userIds ? { userId: { in: userIds } } : {};

  // 1. Negative balances/quantities (CHECK-constrained; belt and braces).
  for (const user of await db.user.findMany({
    where: { ...userFilter, coins: { lt: 0n } },
  })) {
    findings.push({
      check: "negative-balance",
      subject: user.id,
      detail: `coins=${user.coins}`,
    });
  }
  for (const entry of await db.inventoryEntry.findMany({
    where: { ...userIdFilter, quantity: { lt: 0 } },
  })) {
    findings.push({
      check: "negative-inventory",
      subject: entry.id,
      detail: `quantity=${entry.quantity}`,
    });
  }

  // 2. Wallet vs ledger.
  const users = await db.user.findMany({ where: userFilter, select: { id: true, coins: true } });
  const deltas = await db.transaction.groupBy({
    by: ["userId"],
    where: userIdFilter,
    _sum: { coinsDelta: true },
  });
  const deltaByUser = new Map(deltas.map((row) => [row.userId, row._sum.coinsDelta ?? 0n]));
  for (const user of users) {
    const expected = STARTING_COINS + (deltaByUser.get(user.id) ?? 0n);
    if (user.coins !== expected) {
      findings.push({
        check: "wallet-ledger-mismatch",
        subject: user.id,
        detail: `coins=${user.coins} expectedFromLedger=${expected}`,
      });
    }
  }

  // 3. Active instance listings whose escrow is invalid.
  const activeInstanceListings = await db.playerShopListing.findMany({
    where: {
      status: "ACTIVE",
      itemInstanceId: { not: null },
      ...(userIds ? { sellerId: { in: userIds } } : {}),
    },
    include: { itemInstance: true },
  });
  for (const listing of activeInstanceListings) {
    const instance = listing.itemInstance;
    if (!instance || instance.status !== "ESCROWED" || instance.ownerId !== listing.sellerId) {
      findings.push({
        check: "listing-without-escrow",
        subject: listing.id,
        detail: `instance=${listing.itemInstanceId} status=${instance?.status ?? "missing"}`,
      });
    }
  }

  // 4. Escrowed instances without an active listing.
  const escrowed = await db.itemInstance.findMany({
    where: {
      status: "ESCROWED",
      ...(userIds ? { ownerId: { in: userIds } } : {}),
    },
    include: { listings: { where: { status: "ACTIVE" } } },
  });
  for (const instance of escrowed) {
    if (instance.listings.length === 0) {
      findings.push({
        check: "orphaned-escrow",
        subject: instance.id,
        detail: "ESCROWED instance has no active listing",
      });
    }
  }

  // 5. Sold listings without matching parties/ledger rows.
  const sold = await db.playerShopListing.findMany({
    where: {
      status: "SOLD",
      ...(userIds ? { sellerId: { in: userIds } } : {}),
    },
    include: { transactions: true },
  });
  for (const listing of sold) {
    const hasBuyer = listing.buyerId !== null;
    const buyerRow = listing.transactions.some((t) => t.type === "PLAYER_PURCHASE");
    const sellerRow = listing.transactions.some((t) => t.type === "PLAYER_SALE");
    if (!hasBuyer || !buyerRow || !sellerRow) {
      findings.push({
        check: "sale-missing-records",
        subject: listing.id,
        detail: `buyer=${hasBuyer} buyerLedger=${buyerRow} sellerLedger=${sellerRow}`,
      });
    }
  }

  // 6. Shop tills vs sales and claims.
  const shops = await db.playerShop.findMany({
    where: userIds ? { ownerId: { in: userIds } } : {},
  });
  for (const shop of shops) {
    const soldTotals = await db.playerShopListing.findMany({
      where: { shopId: shop.id, status: "SOLD" },
      select: { unitPrice: true, quantity: true },
    });
    const revenue = soldTotals.reduce(
      (sum, row) => sum + row.unitPrice * BigInt(row.quantity),
      0n,
    );
    if (shop.lifetimeRevenue !== revenue) {
      findings.push({
        check: "revenue-mismatch",
        subject: shop.id,
        detail: `lifetimeRevenue=${shop.lifetimeRevenue} salesSum=${revenue}`,
      });
    }
    const claims = await db.transaction.aggregate({
      where: { userId: shop.ownerId, type: "PROCEEDS_CLAIM" },
      _sum: { coinsDelta: true },
    });
    const expectedTill = revenue - (claims._sum.coinsDelta ?? 0n);
    if (shop.unclaimedProceeds !== expectedTill) {
      findings.push({
        check: "till-mismatch",
        subject: shop.id,
        detail: `unclaimed=${shop.unclaimedProceeds} expected=${expectedTill}`,
      });
    }
  }

  // 7. NPC stock vs purchase ledger.
  const stockRows = await db.npcShopStock.findMany({
    where: { status: { in: ["ACTIVE", "SOLD_OUT"] } },
    select: { id: true, quantity: true, initialQuantity: true },
  });
  const npcSales = await db.transaction.groupBy({
    by: ["npcStockId"],
    where: { type: "NPC_PURCHASE", npcStockId: { not: null } },
    _sum: { quantity: true },
  });
  const soldByStock = new Map(npcSales.map((row) => [row.npcStockId, row._sum.quantity ?? 0]));
  for (const stock of stockRows) {
    const sold = soldByStock.get(stock.id) ?? 0;
    if (stock.initialQuantity - stock.quantity !== sold) {
      findings.push({
        check: "npc-stock-mismatch",
        subject: stock.id,
        detail: `initial=${stock.initialQuantity} remaining=${stock.quantity} ledgerSold=${sold}`,
      });
    }
  }

  // 8. Stale idempotency records (started but never completed).
  const stalePending = await db.idempotencyKey.findMany({
    where: {
      ...userIdFilter,
      completedAt: null,
      createdAt: { lt: new Date(Date.now() - 3_600_000) },
    },
  });
  for (const row of stalePending) {
    findings.push({
      check: "stale-idempotency",
      subject: row.id,
      detail: `${row.operation} pending since ${row.createdAt.toISOString()}`,
    });
  }

  // 9. Starter invariants: pets without a claim / claims pointing at
  // another user's pet. (Duplicate claims are impossible by constraint.)
  const owners = await db.pet.groupBy({ by: ["ownerId"], where: userIds ? { ownerId: { in: userIds } } : {} });
  const claims = await db.starterClaim.findMany({
    where: userIds ? { userId: { in: userIds } } : {},
    include: { pet: { select: { ownerId: true } } },
  });
  const claimUsers = new Set(claims.map((claim) => claim.userId));
  for (const owner of owners) {
    if (!claimUsers.has(owner.ownerId)) {
      findings.push({
        check: "pet-without-starter-claim",
        subject: owner.ownerId,
        detail: "user owns pets but has no starter claim",
      });
    }
  }
  for (const claim of claims) {
    if (claim.pet.ownerId !== claim.userId) {
      findings.push({
        check: "starter-claim-wrong-owner",
        subject: claim.id,
        detail: `claim user ${claim.userId} but pet owner ${claim.pet.ownerId}`,
      });
    }
  }

  // 10. Invalid public showcase references.
  const showcaseEntries = await db.showcaseEntry.findMany({
    where: userIdFilter,
    include: {
      item: { select: { stackable: true } },
      itemInstance: { select: { ownerId: true, status: true } },
    },
  });
  for (const entry of showcaseEntries) {
    const bad =
      (entry.item.stackable && entry.itemInstanceId !== null) ||
      (!entry.item.stackable &&
        (entry.itemInstanceId === null ||
          entry.itemInstance?.ownerId !== entry.userId));
    if (bad) {
      findings.push({
        check: "invalid-showcase-reference",
        subject: entry.id,
        detail: `stackable=${entry.item.stackable} instance=${entry.itemInstanceId}`,
      });
    }
  }

  return findings;
}
