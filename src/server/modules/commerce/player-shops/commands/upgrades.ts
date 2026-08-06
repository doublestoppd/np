import type { DbClient } from "@/server/db";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { coinsToJSON } from "@/lib/money";
import { EconomyError } from "../../errors";
import { enforceCommerceRateLimit } from "../../config";
import { assertCommerceAccess } from "../../policies";
import { debitCoins } from "../../wallet";
import { recordLedger } from "../../ledger";
import { ensurePlayerShop } from "./shop";

export interface UpgradeResult {
  [key: string]: number;
  tier: number;
  newCapacity: number;
}

/**
 * Purchases the next capacity upgrade tier. Tiers are content rows; the
 * prerequisite is owning every lower tier; the unique (shop, tier)
 * constraint backstops double purchases.
 */
export async function purchaseCapacityUpgrade(
  db: DbClient,
  {
    userId,
    tier,
    idempotencyKey,
  }: { userId: string; tier: number; idempotencyKey: string },
): Promise<UpgradeResult> {
  await enforceCommerceRateLimit(db, "capacity-upgrade", userId);
  await assertCommerceAccess(db, userId);
  const shop = await ensurePlayerShop(db, userId);

  const { result } = await withIdempotency<UpgradeResult>(
    db,
    {
      userId,
      operation: "capacity-upgrade",
      key: idempotencyKey,
      requestHash: requestHash({ tier }),
    },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pshop:" + shop.id}))`;

      const tierRow = await tx.playerShopUpgradeTier.findUnique({
        where: { tier },
      });
      if (!tierRow || !tierRow.active) {
        throw new EconomyError("UPGRADE_NOT_FOUND");
      }
      const owned = await tx.playerShopUpgradePurchase.findMany({
        where: { shopId: shop.id },
        include: { tier: true },
      });
      if (owned.some((purchase) => purchase.tier.tier === tier)) {
        throw new EconomyError("UPGRADE_ALREADY_OWNED");
      }
      const ownedTiers = new Set(owned.map((purchase) => purchase.tier.tier));
      for (let required = 1; required < tier; required++) {
        if (!ownedTiers.has(required)) {
          throw new EconomyError("UPGRADE_PREREQUISITE_MISSING");
        }
      }

      await debitCoins(tx, { userId, amount: tierRow.price });
      await tx.playerShopUpgradePurchase.create({
        data: { shopId: shop.id, tierId: tierRow.id },
      });
      const updated = await tx.playerShop.update({
        where: { id: shop.id },
        data: { listingCapacity: { increment: tierRow.capacityBonus } },
      });
      await recordLedger(tx, {
        userId,
        type: "CAPACITY_UPGRADE",
        coinsDelta: -tierRow.price,
        note: `Bought shop upgrade "${tierRow.name}" (+${tierRow.capacityBonus} slots)`,
        metadata: { tier: tierRow.tier, price: coinsToJSON(tierRow.price) },
      });
      return { tier: tierRow.tier, newCapacity: updated.listingCapacity };
    },
  );
  return result;
}
