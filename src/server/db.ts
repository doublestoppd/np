import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Transaction ownership convention (docs/conventions.md):
 * - `DbClient` (the root client) may BEGIN a transaction. Top-level
 *   commands own their transaction unless composed by a higher command.
 * - `DbTx` is accepted by low-level helpers (debit, credit, grant, escrow,
 *   ledger, provenance) that must participate in an existing transaction.
 *   Helpers never begin their own.
 */
export type DbClient = PrismaClient;
export type DbTx = Prisma.TransactionClient;
/** For read-only helpers callable either inside or outside a transaction. */
export type DbReader = DbClient | DbTx;
