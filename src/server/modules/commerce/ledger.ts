import type { Prisma, Transaction, TransactionType } from "@prisma/client";
import type { DbTx } from "@/server/db";

/**
 * Append-only economic ledger writes (docs/conventions.md). The stored
 * wallet/till balances are authoritative; every balance or ownership
 * mutation records a ledger row IN THE SAME TRANSACTION via this helper.
 * Application code never updates or deletes ledger rows.
 */
export interface LedgerEntryInput {
  userId: string;
  type: TransactionType;
  counterpartyUserId?: string | null;
  itemId?: string | null;
  itemInstanceId?: string | null;
  petId?: string | null;
  npcStockId?: string | null;
  playerListingId?: string | null;
  restockId?: string | null;
  quantity?: number;
  coinsDelta?: bigint;
  note?: string;
  metadata?: Prisma.InputJsonValue;
}

export async function recordLedger(
  tx: DbTx,
  entry: LedgerEntryInput,
): Promise<Transaction> {
  return tx.transaction.create({
    data: {
      userId: entry.userId,
      type: entry.type,
      counterpartyUserId: entry.counterpartyUserId ?? null,
      itemId: entry.itemId ?? null,
      itemInstanceId: entry.itemInstanceId ?? null,
      petId: entry.petId ?? null,
      npcStockId: entry.npcStockId ?? null,
      playerListingId: entry.playerListingId ?? null,
      restockId: entry.restockId ?? null,
      quantity: entry.quantity ?? 1,
      coinsDelta: entry.coinsDelta ?? 0n,
      note: entry.note,
      metadata: entry.metadata,
    },
  });
}
