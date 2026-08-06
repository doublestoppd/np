import { Prisma } from "@prisma/client";
import type { DbClient, DbTx } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { log } from "@/server/logging";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { assertCommerceAccess } from "@/server/modules/commerce/policies";
import { removeItem } from "@/server/modules/items/ownership";
import { EconomyError } from "@/server/modules/commerce/errors";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { RequestError } from "./errors";
import { enforceRequestRateLimit } from "./config";

/** JSON-safe completion result (stored for idempotent replay). */
export type RequestCompletionResult = {
  boardKey: string;
  requestSlug: string;
  requestTitle: string;
  /** Serialized coins granted. */
  rewardCoins: string;
  /** Serialized wallet balance after the credit. */
  newBalance: string;
  completionOrdinal: number;
  gameDate: GameDate;
  /** Slug of the next request, or null when the board has none active. */
  nextRequestSlug: string | null;
  nextRequestTitle: string | null;
  /** Progress token to submit with the next completion. */
  stateVersion: number;
};

export interface CompleteRequestParams {
  userId: string;
  boardKey: string;
  /** Optimistic concurrency: the version the player's view was built from. */
  expectedStateVersion: number;
  idempotencyKey: string;
  gameDate?: GameDate;
}

/**
 * Completes the player's current request on a board: consumes the required
 * items, credits the reward, records immutable history, and advances to the
 * next active request — all in one transaction, so a failure anywhere
 * leaves the player exactly as they were.
 *
 * The current request is resolved from authoritative progress, never from
 * anything the client submits. `expectedStateVersion` is a conflict token,
 * not an instruction: a stale value refuses the whole operation.
 */
export async function completeCurrentRequest(
  db: DbClient,
  {
    userId,
    boardKey,
    expectedStateVersion,
    idempotencyKey,
    gameDate = currentGameDate(),
  }: CompleteRequestParams,
): Promise<{ result: RequestCompletionResult; replayed: boolean }> {
  await enforceRequestRateLimit(db, "request-complete", userId);
  try {
    await assertCommerceAccess(db, userId);
  } catch (error) {
    if (error instanceof EconomyError) {
      throw new RequestError("COMMERCE_DISABLED");
    }
    throw error;
  }

  return withIdempotency<RequestCompletionResult>(
    db,
    {
      userId,
      operation: "request-complete",
      key: idempotencyKey,
      requestHash: requestHash({ boardKey }),
    },
    async (tx) => {
      const board = await tx.requestBoard.findUnique({
        where: { key: boardKey },
        include: {
          requests: {
            where: { active: true },
            orderBy: { sequencePosition: "asc" },
            select: { id: true, slug: true, title: true, sequencePosition: true },
          },
        },
      });
      if (!board) {
        throw new RequestError("BOARD_NOT_FOUND");
      }
      if (!board.active) {
        throw new RequestError("BOARD_INACTIVE");
      }
      if (board.requests.length === 0) {
        throw new RequestError("NO_CURRENT_REQUEST");
      }

      // Assign lazily on first completion so a page render never mutates.
      const progress = await ensureProgressRow(tx, {
        userId,
        boardId: board.id,
        firstRequestId: board.requests[0]!.id,
      });

      if (progress.stateVersion !== expectedStateVersion) {
        throw new RequestError("STALE_STATE");
      }

      // The UTC daily cap. Reaching it never removes the assignment — the
      // same request is simply completed tomorrow.
      const completedToday = await tx.requestCompletion.count({
        where: { userId, boardId: board.id, gameDate },
      });
      if (completedToday >= board.dailyCompletionLimit) {
        throw new RequestError("DAILY_LIMIT_REACHED");
      }

      const definitionId = progress.currentRequestDefinitionId;
      if (!definitionId) {
        throw new RequestError("NO_CURRENT_REQUEST");
      }
      const definition = await tx.requestDefinition.findUnique({
        where: { id: definitionId },
        include: { requirements: { include: { item: true } } },
      });
      if (!definition) {
        throw new RequestError("NO_CURRENT_REQUEST");
      }
      if (!definition.active) {
        throw new RequestError("REQUEST_INACTIVE");
      }

      // Consume requirements through the ownership boundary. Its guarded
      // decrement means an insufficient stack aborts the transaction with
      // nothing consumed and nothing granted.
      for (const requirement of definition.requirements) {
        try {
          await removeItem(tx, {
            userId,
            itemId: requirement.itemId,
            quantity: requirement.quantity,
          });
        } catch (error) {
          if (
            error instanceof EconomyError &&
            error.economyCode === "INSUFFICIENT_ITEMS"
          ) {
            throw new RequestError("INSUFFICIENT_ITEMS");
          }
          throw error;
        }
      }

      const reward = definition.rewardCoins;
      const ledgerEntry = await recordLedger(tx, {
        userId,
        type: "REQUEST_REWARD",
        coinsDelta: reward,
        quantity: 1,
        note: `Completed "${definition.title}" at ${board.name}`,
      });
      await creditCoins(tx, { userId, amount: reward });
      const wallet = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { coins: true },
      });

      const completionOrdinal = progress.totalCompleted + 1;
      await tx.requestCompletion.create({
        data: {
          userId,
          boardId: board.id,
          requestDefinitionId: definition.id,
          completionOrdinal,
          gameDate,
          rewardCoins: reward,
          // Snapshot: history stays truthful after content edits.
          requirementsSnapshot: definition.requirements.map((requirement) => ({
            itemSlug: requirement.item.slug,
            itemName: requirement.item.name,
            quantity: requirement.quantity,
          })) satisfies Prisma.InputJsonValue,
          transactionId: ledgerEntry.id,
        },
      });

      // Advance: next active position, wrapping after the last.
      const ordered = board.requests;
      const currentIndex = ordered.findIndex((entry) => entry.id === definition.id);
      const next =
        currentIndex === -1
          ? ordered[0]!
          : (ordered[(currentIndex + 1) % ordered.length] ?? ordered[0]!);

      const advanced = await tx.playerRequestBoardProgress.updateMany({
        where: { id: progress.id, stateVersion: expectedStateVersion },
        data: {
          currentRequestDefinitionId: next.id,
          totalCompleted: completionOrdinal,
          stateVersion: { increment: 1 },
        },
      });
      if (advanced.count === 0) {
        // Another submission advanced this board first; the whole
        // transaction rolls back, so nothing was consumed or granted.
        throw new RequestError("STALE_STATE");
      }

      log.info("requests.completed", {
        userId,
        board: board.key,
        request: definition.slug,
        reward: coinsToJSON(reward),
        gameDate,
      });

      return {
        boardKey: board.key,
        requestSlug: definition.slug,
        requestTitle: definition.title,
        rewardCoins: coinsToJSON(reward),
        newBalance: coinsToJSON(wallet.coins),
        completionOrdinal,
        gameDate,
        nextRequestSlug: next.slug,
        nextRequestTitle: next.title,
        stateVersion: expectedStateVersion + 1,
      };
    },
  );
}

/**
 * Reads the player's progress row, creating it (assigned to the first
 * active request) on first use. The unique (userId, boardId) constraint
 * makes a concurrent create safe: the loser re-reads the winner's row.
 */
async function ensureProgressRow(
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
