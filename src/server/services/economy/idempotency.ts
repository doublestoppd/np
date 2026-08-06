import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { EconomyError } from "./errors";

export type Tx = Prisma.TransactionClient;

/** Stable fingerprint of the material request fields. */
export function requestHash(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);
}

export interface IdempotentContext {
  userId: string;
  /** Operation namespace, e.g. "npc-purchase". Keys are scoped per user+op. */
  operation: string;
  key: string;
  /** Fingerprint of the request; key reuse with a different one is rejected. */
  requestHash: string;
}

/**
 * Runs `fn` exactly once per (user, operation, key). The key row is created
 * inside the same transaction as the mutation, so:
 * - a failed attempt rolls the key back and a retry runs fresh;
 * - a completed attempt stores its result, and retries replay it;
 * - concurrent duplicates collide on the unique constraint and neither
 *   double-executes.
 * Reusing a key for a materially different request is rejected.
 */
export async function withIdempotency<T extends Prisma.InputJsonValue>(
  db: PrismaClient,
  ctx: IdempotentContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  const where = {
    userId_operation_key: {
      userId: ctx.userId,
      operation: ctx.operation,
      key: ctx.key,
    },
  };

  const existing = await db.idempotencyKey.findUnique({ where });
  if (existing) {
    return replay<T>(existing, ctx);
  }

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          userId: ctx.userId,
          operation: ctx.operation,
          key: ctx.key,
          requestHash: ctx.requestHash,
        },
      });
      const value = await fn(tx);
      await tx.idempotencyKey.update({
        where,
        data: { result: value, completedAt: new Date() },
      });
      return value;
    });
    return { result, replayed: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Lost a race with a concurrent identical request.
      const winner = await db.idempotencyKey.findUnique({ where });
      if (winner) {
        return replay<T>(winner, ctx);
      }
      throw new EconomyError("OPERATION_IN_PROGRESS");
    }
    throw error;
  }
}

function replay<T>(
  row: { requestHash: string; result: Prisma.JsonValue | null },
  ctx: IdempotentContext,
): { result: T; replayed: boolean } {
  if (row.requestHash !== ctx.requestHash) {
    throw new EconomyError("IDEMPOTENCY_KEY_REUSED");
  }
  if (row.result === null) {
    // A concurrent attempt holds the key but hasn't finished (or died
    // mid-transaction, in which case its rollback will free the key).
    throw new EconomyError("OPERATION_IN_PROGRESS");
  }
  return { result: row.result as T, replayed: true };
}
