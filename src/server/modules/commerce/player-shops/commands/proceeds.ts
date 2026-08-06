import type { DbClient } from "@/server/db";
import { withIdempotency, requestHash } from "@/server/security/idempotency";
import { coinsToJSON } from "@/lib/money";
import { EconomyError } from "../../errors";
import { enforceCommerceRateLimit } from "../../config";
import { creditCoins } from "../../wallet";
import { recordLedger } from "../../ledger";

export interface ClaimResult {
  [key: string]: string;
  /** Serialized coins. */
  claimed: string;
}

/**
 * Claims the full till balance into the wallet, exactly once: the guarded
 * equality update means concurrent claims cannot credit the same coins
 * twice. Deliberately available to commerce-disabled sellers — previously
 * earned proceeds are theirs (docs/conventions.md).
 */
export async function claimProceeds(
  db: DbClient,
  { userId, idempotencyKey }: { userId: string; idempotencyKey: string },
): Promise<ClaimResult> {
  await enforceCommerceRateLimit(db, "proceeds-claim", userId);

  const { result } = await withIdempotency<ClaimResult>(
    db,
    {
      userId,
      operation: "proceeds-claim",
      key: idempotencyKey,
      requestHash: requestHash({}),
    },
    async (tx) => {
      const shop = await tx.playerShop.findUnique({ where: { ownerId: userId } });
      if (!shop) {
        throw new EconomyError("SHOP_NOT_FOUND");
      }
      const amount = shop.unclaimedProceeds;
      if (amount <= 0n) {
        throw new EconomyError("NOTHING_TO_CLAIM");
      }
      const cleared = await tx.playerShop.updateMany({
        where: { id: shop.id, unclaimedProceeds: amount },
        data: { unclaimedProceeds: 0n },
      });
      if (cleared.count === 0) {
        // A concurrent sale or claim changed the balance mid-flight.
        throw new EconomyError("CONCURRENT_MODIFICATION");
      }
      await creditCoins(tx, { userId, amount });
      await recordLedger(tx, {
        userId,
        type: "PROCEEDS_CLAIM",
        coinsDelta: amount,
        note: `Claimed ${coinsToJSON(amount)} coins from the shop till`,
      });
      return { claimed: coinsToJSON(amount) };
    },
  );
  return result;
}
