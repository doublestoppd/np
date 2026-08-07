import { Prisma } from "@prisma/client";
import type { DbTx } from "@/server/db";

/**
 * Reads the player's progress row, creating it (assigned to the first
 * active request) on first use. Assignment happens here, inside a command's
 * transaction — never during a page render, so looking at a board cannot
 * mutate it.
 *
 * The unique (userId, boardId) constraint makes a concurrent create safe:
 * the loser re-reads the winner's row rather than failing.
 */
export async function ensureProgressRow(
  tx: DbTx,
  {
    userId,
    boardId,
    firstRequestId,
  }: { userId: string; boardId: string; firstRequestId: string },
) {
  const existing = await tx.playerRequestBoardProgress.findUnique({
    where: { userId_boardId: { userId, boardId } },
  });
  if (existing) {
    return existing;
  }
  try {
    return await tx.playerRequestBoardProgress.create({
      data: { userId, boardId, currentRequestDefinitionId: firstRequestId },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return tx.playerRequestBoardProgress.findUniqueOrThrow({
        where: { userId_boardId: { userId, boardId } },
      });
    }
    throw error;
  }
}
