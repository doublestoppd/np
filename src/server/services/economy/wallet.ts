import { EconomyError } from "./errors";
import type { Tx } from "./idempotency";

/**
 * Wallet mutations. Transaction-scoped: callers pass the tx client so the
 * debit/credit commits or rolls back with the rest of the operation. The
 * guarded update (coins >= amount) plus the database CHECK constraint make
 * overspending impossible even under concurrency.
 */
export async function debitCoins(
  tx: Tx,
  { userId, amount }: { userId: string; amount: number },
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
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
  tx: Tx,
  { userId, amount }: { userId: string; amount: number },
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new EconomyError("INVALID_PRICE");
  }
  await tx.user.update({
    where: { id: userId },
    data: { coins: { increment: amount } },
  });
}
