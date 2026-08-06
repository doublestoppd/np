import type { DbTx } from "@/server/db";
import { EconomyError } from "./errors";
import { MAX_TRANSACTION_TOTAL } from "@/lib/money";

/**
 * Wallet mutations (bigint coins; src/lib/money.ts is the shared boundary).
 * Transaction-scoped: callers pass the tx client so the debit/credit
 * commits or rolls back with the rest of the operation. The guarded update
 * (coins >= amount) plus the database CHECK constraint make overspending
 * impossible even under concurrency. The stored balance is authoritative;
 * callers record the matching ledger row in the same transaction.
 */
export async function debitCoins(
  tx: DbTx,
  { userId, amount }: { userId: string; amount: bigint },
): Promise<void> {
  if (amount <= 0n || amount > MAX_TRANSACTION_TOTAL) {
    throw new EconomyError("INVALID_PRICE");
  }
  const result = await tx.user.updateMany({
    where: { id: userId, coins: { gte: amount } },
    data: { coins: { decrement: amount } },
  });
  if (result.count === 0) {
    throw new EconomyError("INSUFFICIENT_FUNDS");
  }
}

export async function creditCoins(
  tx: DbTx,
  { userId, amount }: { userId: string; amount: bigint },
): Promise<void> {
  if (amount <= 0n || amount > MAX_TRANSACTION_TOTAL) {
    throw new EconomyError("INVALID_PRICE");
  }
  await tx.user.update({
    where: { id: userId },
    data: { coins: { increment: amount } },
  });
}
