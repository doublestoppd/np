import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { RequestError } from "./errors";
import { enforceRequestRateLimit } from "./config";
import { ensureProgressRow } from "./progress";

/** JSON-safe skip result (stored for idempotent replay). */
export type RequestSkipResult = {
  boardKey: string;
  /** The request that was set aside. */
  skippedSlug: string;
  skippedTitle: string;
  /** The request now posted for this player. */
  nextRequestSlug: string;
  nextRequestTitle: string;
  /** Progress token to submit with the next command. */
  stateVersion: number;
};

export interface SkipRequestParams {
  userId: string;
  boardKey: string;
  /** Optimistic concurrency: the version the player's view was built from. */
  expectedStateVersion: number;
  idempotencyKey: string;
}

/**
 * Sets the current request aside and posts the next one in the board's
 * rotation.
 *
 * This exists because the rotation is otherwise a hard stop. A request asks
 * for specific foods, those foods come only from the daily meal, and the
 * meal's pool is random — so a player holding the wrong pantry waits, with
 * nothing to do, until the right ingredient happens to arrive. The board is
 * a fixed sequence, so waiting is the only move available; that is a wall,
 * not a difficulty curve, and docs/design-philosophy.md does not allow it.
 *
 * Skipping is deliberately free: it costs no coins, consumes no items,
 * grants nothing, and does not touch the daily completion cap. A player who
 * skips every request on the board simply arrives back where they started,
 * having gained nothing but a look at the list. Charging for it, or
 * rationing it, would turn "I can't do this one yet" into a penalty — and
 * the daily cap already bounds what a board can pay out.
 *
 * Skipped requests are not recorded. Nothing happened: no items moved, no
 * coins moved, and history is for things that did.
 */
export async function skipCurrentRequest(
  db: DbClient,
  { userId, boardKey, expectedStateVersion, idempotencyKey }: SkipRequestParams,
): Promise<{ result: RequestSkipResult; replayed: boolean }> {
  await enforceRequestRateLimit(db, "request-skip", userId);

  return withIdempotency<RequestSkipResult>(
    db,
    {
      userId,
      operation: "request-skip",
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
            select: { id: true, slug: true, title: true },
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
      // Wrapping past the only posting would hand back the same request and
      // burn a state version doing it.
      if (board.requests.length < 2) {
        throw new RequestError("NO_OTHER_REQUEST");
      }

      const progress = await ensureProgressRow(tx, {
        userId,
        boardId: board.id,
        firstRequestId: board.requests[0]!.id,
      });
      if (progress.stateVersion !== expectedStateVersion) {
        throw new RequestError("STALE_STATE");
      }

      const definitionId = progress.currentRequestDefinitionId;
      if (!definitionId) {
        throw new RequestError("NO_CURRENT_REQUEST");
      }
      const currentIndex = board.requests.findIndex(
        (entry) => entry.id === definitionId,
      );
      // An assignment pointing at a now-inactive request lands here; the
      // next posting is the top of the rotation.
      const current = currentIndex === -1 ? null : board.requests[currentIndex]!;
      const next =
        currentIndex === -1
          ? board.requests[0]!
          : board.requests[(currentIndex + 1) % board.requests.length]!;

      const advanced = await tx.playerRequestBoardProgress.updateMany({
        where: { id: progress.id, stateVersion: expectedStateVersion },
        data: {
          currentRequestDefinitionId: next.id,
          stateVersion: { increment: 1 },
        },
      });
      if (advanced.count === 0) {
        // Another submission moved this board first; the transaction rolls
        // back, so the player's assignment is whatever that one set.
        throw new RequestError("STALE_STATE");
      }

      log.info("requests.skipped", {
        userId,
        board: board.key,
        from: current?.slug ?? null,
        to: next.slug,
      });

      return {
        boardKey: board.key,
        skippedSlug: current?.slug ?? next.slug,
        skippedTitle: current?.title ?? next.title,
        nextRequestSlug: next.slug,
        nextRequestTitle: next.title,
        stateVersion: expectedStateVersion + 1,
      };
    },
  );
}

