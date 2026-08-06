import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";

export interface RequestRequirementView {
  itemId: string;
  itemSlug: string;
  itemName: string;
  itemArtKey: string;
  itemCategorySlug: string | null;
  required: number;
  owned: number;
}

export interface CurrentRequestView {
  definitionId: string;
  slug: string;
  title: string;
  flavorText: string;
  /** Serialized coins. */
  rewardCoins: string;
  requirements: RequestRequirementView[];
  /** Every requirement is satisfied by what the player currently holds. */
  deliverable: boolean;
}

export interface RequestCompletionView {
  title: string;
  gameDate: GameDate;
  /** Serialized coins. */
  rewardCoins: string;
  completedAt: Date;
}

export interface RequestBoardView {
  boardKey: string;
  name: string;
  description: string;
  available: boolean;
  /** Optimistic-concurrency token for the completion command. */
  stateVersion: number;
  totalCompleted: number;
  dailyLimit: number;
  completedToday: number;
  remainingToday: number;
  current: CurrentRequestView | null;
  recent: RequestCompletionView[];
}

const RECENT_LIMIT = 3;

/**
 * Board summary plus this player's authoritative status. Read-only: it
 * never assigns a request (assignment happens in the completion command's
 * transaction, and lazily in `ensureCurrentRequest`), so a page render
 * cannot mutate progress.
 */
export async function getBoardView(
  db: DbReader,
  {
    userId,
    boardKey,
    gameDate = currentGameDate(),
  }: { userId: string; boardKey: string; gameDate?: GameDate },
): Promise<RequestBoardView | null> {
  const board = await db.requestBoard.findUnique({
    where: { key: boardKey },
    include: {
      requests: {
        where: { active: true },
        orderBy: { sequencePosition: "asc" },
        include: { requirements: { include: { item: { include: { category: true } } } } },
      },
    },
  });
  if (!board) {
    return null;
  }

  const [progress, completedToday, recent] = await Promise.all([
    db.playerRequestBoardProgress.findUnique({
      where: { userId_boardId: { userId, boardId: board.id } },
      include: {
        currentRequest: {
          include: {
            requirements: { include: { item: { include: { category: true } } } },
          },
        },
      },
    }),
    db.requestCompletion.count({
      where: { userId, boardId: board.id, gameDate },
    }),
    db.requestCompletion.findMany({
      where: { userId, boardId: board.id },
      orderBy: { completedAt: "desc" },
      take: RECENT_LIMIT,
      include: { requestDefinition: { select: { title: true } } },
    }),
  ]);

  // A player who has never visited sees the first active request; the row
  // itself is only written when they act.
  const assigned = progress?.currentRequest ?? board.requests[0] ?? null;

  let current: CurrentRequestView | null = null;
  if (assigned) {
    const itemIds = assigned.requirements.map((requirement) => requirement.itemId);
    const owned = await db.inventoryEntry.findMany({
      where: { userId, itemId: { in: itemIds } },
      select: { itemId: true, quantity: true },
    });
    const ownedByItem = new Map(owned.map((entry) => [entry.itemId, entry.quantity]));
    const requirements: RequestRequirementView[] = assigned.requirements.map(
      (requirement) => ({
        itemId: requirement.itemId,
        itemSlug: requirement.item.slug,
        itemName: requirement.item.name,
        itemArtKey: requirement.item.artKey,
        itemCategorySlug: requirement.item.category?.slug ?? null,
        required: requirement.quantity,
        owned: ownedByItem.get(requirement.itemId) ?? 0,
      }),
    );
    current = {
      definitionId: assigned.id,
      slug: assigned.slug,
      title: assigned.title,
      flavorText: assigned.flavorText,
      rewardCoins: coinsToJSON(assigned.rewardCoins),
      requirements,
      deliverable: requirements.every((r) => r.owned >= r.required),
    };
  }

  return {
    boardKey: board.key,
    name: board.name,
    description: board.description,
    available: board.active && board.requests.length > 0,
    stateVersion: progress?.stateVersion ?? 0,
    totalCompleted: progress?.totalCompleted ?? 0,
    dailyLimit: board.dailyCompletionLimit,
    completedToday,
    remainingToday: Math.max(0, board.dailyCompletionLimit - completedToday),
    current,
    recent: recent.map((completion) => ({
      title: completion.requestDefinition.title,
      gameDate: completion.gameDate,
      rewardCoins: coinsToJSON(completion.rewardCoins),
      completedAt: completion.completedAt,
    })),
  };
}
