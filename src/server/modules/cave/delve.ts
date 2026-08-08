import { Prisma } from "@prisma/client";
import type { DbClient, DbTx } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { creditCoins } from "@/server/modules/commerce/wallet";
import { grantItem } from "@/server/modules/items/ownership";
import { isDistributable } from "@/server/modules/items/lifecycle";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { pickFlavorLine, pickWeighted } from "@/server/modules/daily/random";
import { coinsToJSON } from "@/lib/money";
import {
  CAVE_DEPTH,
  cacheAt,
  enforceCaveRateLimit,
  totalOnOffer,
} from "./config";
import { correctDoor, newDelveSeed, replayChoices } from "./layout";
import { CaveError } from "./errors";

/**
 * The Sunken Stair: one descent a day (ADR-59).
 *
 * The security shape, and it is the whole module:
 *
 * - The client sends a door number and the depth it thinks it is at.
 *   Nothing else. It is never told which door is which, before or after —
 *   a delve reveals its own history and nothing about its future.
 * - `@@unique([userId, gameDate])` IS the once-a-day rule. Not a count,
 *   not a check-then-insert: two concurrent attempts to start collide on
 *   the constraint and exactly one row exists.
 * - Every advance is an equality-guarded append on the stored choice log,
 *   so two submissions racing cannot both land — the loser is told to try
 *   again rather than silently forking the descent.
 * - A cache is paid inside the same transaction that records the step
 *   that found it, so a wallet can never disagree with the log.
 */

/** What the player is shown. Contains no unanswered room's answer. */
export interface CaveRoomView {
  depth: number;
  name: string;
  description: string;
  doors: readonly [string, string];
}

export interface CaveStepView {
  depth: number;
  roomName: string;
  /** Which door they took. History, not a hint about anything ahead. */
  door: 0 | 1;
  doorLabel: string;
  correct: boolean;
  flavor: string;
  /** Coins found in this room, serialized. "0" when it held nothing. */
  coins: string;
}

export interface CaveDelveView {
  gameDate: GameDate;
  status: "NOT_STARTED" | "IN_PROGRESS" | "CLEARED" | "TURNED_BACK";
  /** Rooms cleared so far. */
  depth: number;
  totalDepth: number;
  /** The room in front of them, or null when the descent is over. */
  current: CaveRoomView | null;
  /** Every step taken, oldest first. */
  steps: readonly CaveStepView[];
  /** Coins found today, serialized. */
  coinsEarned: string;
  /** What the hoard gave up, when it did. */
  prize: { name: string; slug: string; artKey: string } | null;
  /** Serialized total the caches hold, for a player deciding whether to go. */
  onOffer: string;
}

interface SectionRow {
  sectionIndex: number;
  name: string;
  description: string;
  doorOne: string;
  doorTwo: string;
  turnedBackFlavor: string;
  onwardFlavor: string;
}

async function loadSections(db: DbClient): Promise<SectionRow[]> {
  const sections = await db.caveSection.findMany({
    orderBy: { sectionIndex: "asc" },
  });
  if (sections.length !== CAVE_DEPTH) {
    // Content is short or long. Refuse rather than run a cave of the
    // wrong length: the depth is in a CHECK constraint, the reward ladder,
    // and the copy, and a mismatch would quietly break all three.
    log.error("cave.sections-wrong-length", {
      found: sections.length,
      expected: CAVE_DEPTH,
    });
    throw new CaveError("NO_SECTIONS");
  }
  return sections;
}

function roomOf(section: SectionRow): CaveRoomView {
  return {
    depth: section.sectionIndex,
    name: section.name,
    description: section.description,
    doors: [section.doorOne, section.doorTwo],
  };
}

/**
 * Rebuilds the visible history from the stored log.
 *
 * Derived rather than stored, for the same reason the matching table
 * derives its board: two records of one truth is one record too many, and
 * the one that drifts is always the copy.
 */
function stepsOf(
  sections: SectionRow[],
  seed: string,
  choices: string,
): CaveStepView[] {
  const steps: CaveStepView[] = [];
  for (let index = 0; index < choices.length; index += 1) {
    const depth = index + 1;
    const section = sections[index] as SectionRow;
    const door = (choices[index] === "1" ? 1 : 0) as 0 | 1;
    const correct = door === correctDoor(seed, depth);
    const coins = correct ? (cacheAt(depth) ?? 0n) : 0n;
    steps.push({
      depth,
      roomName: section.name,
      door,
      doorLabel: door === 0 ? section.doorOne : section.doorTwo,
      correct,
      flavor: pickFlavorLine(
        correct ? section.onwardFlavor : section.turnedBackFlavor,
      ),
      coins: coinsToJSON(coins),
    });
  }
  return steps;
}

/**
 * Today's descent, or the invitation to start one.
 *
 * Read-only: visiting the cave never opens it. Starting is a thing the
 * player does on purpose, because it is the only one they get today.
 */
export async function getDelveView(
  db: DbClient,
  {
    userId,
    clock = systemClock,
  }: { userId: string; clock?: Clock },
): Promise<CaveDelveView> {
  const gameDate = currentGameDate(clock);
  const [sections, delve, onOffer] = await Promise.all([
    loadSections(db),
    db.caveDelve.findUnique({
      where: { userId_gameDate: { userId, gameDate } },
      include: { prizeItem: true },
    }),
    Promise.resolve(coinsToJSON(totalOnOffer())),
  ]);

  if (!delve) {
    return {
      gameDate,
      status: "NOT_STARTED",
      depth: 0,
      totalDepth: CAVE_DEPTH,
      current: null,
      steps: [],
      coinsEarned: "0",
      prize: null,
      onOffer,
    };
  }

  const steps = stepsOf(sections, delve.seed, delve.choices);
  const { depth, turnedBack } = replayChoices(delve.seed, delve.choices);
  const finished = delve.status !== "IN_PROGRESS";
  return {
    gameDate,
    status: delve.status,
    depth,
    totalDepth: CAVE_DEPTH,
    // The next room, and only the next room. Rendering the whole descent
    // would hand a player the shape of what is ahead; there is nothing
    // secret in a room's prose, but there is no reason to show a door
    // that has not been reached.
    current:
      finished || turnedBack || depth >= CAVE_DEPTH
        ? null
        : roomOf(sections[depth] as SectionRow),
    steps,
    coinsEarned: coinsToJSON(delve.coinsEarned),
    prize: delve.prizeItem
      ? {
          name: delve.prizeItem.name,
          slug: delve.prizeItem.slug,
          artKey: delve.prizeItem.artKey,
        }
      : null,
    onOffer,
  };
}

/**
 * Goes in.
 *
 * Idempotent by construction: the unique constraint means a second call
 * finds the row it just made. A delve that is already finished is refused
 * — that is the one-a-day rule, and it is enforced here rather than by
 * counting rows.
 */
export async function beginDelve(
  db: DbClient,
  { userId, clock = systemClock }: { userId: string; clock?: Clock },
): Promise<CaveDelveView> {
  await enforceCaveRateLimit(db, "begin", userId, clock.now());
  const gameDate = currentGameDate(clock);
  await loadSections(db);

  const existing = await db.caveDelve.findUnique({
    where: { userId_gameDate: { userId, gameDate } },
  });
  if (existing) {
    if (existing.status !== "IN_PROGRESS") {
      throw new CaveError("ALREADY_DELVED");
    }
    return getDelveView(db, { userId, clock });
  }

  try {
    await db.caveDelve.create({
      data: {
        userId,
        gameDate,
        seed: newDelveSeed(),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Somebody else's request got there first. Theirs is the descent.
      return getDelveView(db, { userId, clock });
    }
    throw error;
  }
  log.info("cave.began", { userId, gameDate });
  return getDelveView(db, { userId, clock });
}

export interface ChooseResult {
  view: CaveDelveView;
  /** The step just taken. */
  step: CaveStepView;
  /** Coins this choice paid, serialized. */
  coinsAwarded: string;
  /** What the hoard gave up, when this was the last room. */
  prizeName: string | null;
}

/**
 * Opens one of the two doors.
 *
 * `depth` is a guard, not an instruction: it must be the room the server
 * thinks they are in. A stale board — a second tab, a back button, a
 * double submit — names the wrong room and is refused, rather than
 * advancing a descent the player is not looking at.
 */
export async function chooseDoor(
  db: DbClient,
  {
    userId,
    depth,
    door,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    depth: number;
    door: 0 | 1;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: ChooseResult; replayed: boolean }> {
  await enforceCaveRateLimit(db, "choose", userId, clock.now());
  const gameDate = currentGameDate(clock);
  const sections = await loadSections(db);

  /**
   * EVERY state-dependent check lives inside the idempotent body, and
   * that ordering is load-bearing.
   *
   * They used to sit above this call, which read correctly and was wrong:
   * a replayed submission — the double tap, the retried request, the
   * exact case idempotency exists for — found the descent already one
   * room further on and was told "you've moved on from that room". The
   * player's second tap on the same button became an error message about
   * a step that had in fact succeeded. `withIdempotency` returns the
   * stored result before ever calling this function, so a genuine replay
   * now never reaches a guard it is bound to fail.
   *
   * The fingerprint is the request, not the state: same player, same day,
   * same room, same door. Reusing one key for a different door is
   * rejected by the key store rather than by anything here.
   */
  const { result, replayed } = await withIdempotency(
    db,
    {
      userId,
      operation: "cave-choose",
      key: idempotencyKey,
      requestHash: requestHash({ gameDate, depth, door }),
    },
    async (tx) => {
      const delve = await tx.caveDelve.findUnique({
        where: { userId_gameDate: { userId, gameDate } },
      });
      if (!delve) {
        throw new CaveError("NO_DELVE");
      }
      if (delve.status !== "IN_PROGRESS") {
        throw new CaveError("DELVE_OVER");
      }
      // A stale second tab names the room it last saw; a script trying to
      // skip names a deeper one. Both are refused, and a refusal inside
      // the transaction rolls the key back so an honest retry runs fresh.
      if (depth !== delve.choices.length + 1 || depth > CAVE_DEPTH) {
        throw new CaveError("WRONG_ROOM");
      }

      const section = sections[depth - 1] as SectionRow;
      const correct = door === correctDoor(delve.seed, depth);
      const cache = correct ? (cacheAt(depth) ?? 0n) : 0n;
      const cleared = correct && depth === CAVE_DEPTH;
      // Drawn in here rather than before the transaction, unlike the meal
      // and the forage spot: those decide what to give before they know
      // whether anything is owed, and this cannot know until the guards
      // above have passed.
      const prizeEntry = cleared ? await drawHoard(tx) : null;

      // Equality-guarded append: two submissions racing cannot both land.
      const advanced = await tx.caveDelve.updateMany({
        where: {
          id: delve.id,
          status: "IN_PROGRESS",
          choices: delve.choices,
        },
        data: {
          choices: `${delve.choices}${door}`,
          coinsEarned: { increment: cache },
          ...(correct
            ? cleared
              ? {
                  status: "CLEARED" as const,
                  endedAt: clock.now(),
                  prizeItemId: prizeEntry?.item.id,
                }
              : {}
            : { status: "TURNED_BACK" as const, endedAt: clock.now() }),
        },
      });
      if (advanced.count === 0) {
        throw new CaveError("CONCURRENT_CHOICE");
      }

      if (cache > 0n) {
        await recordLedger(tx, {
          userId,
          type: "CAVE_FIND",
          coinsDelta: cache,
          note: `Found coins at ${section.name}, ${depth} down the Sunken Stair`,
          metadata: { gameDate, depth },
        });
        await creditCoins(tx, { userId, amount: cache });
      }

      if (prizeEntry) {
        const ledger = await recordLedger(tx, {
          userId,
          type: "CAVE_FIND",
          itemId: prizeEntry.item.id,
          quantity: 1,
          note: `Carried ${prizeEntry.item.name} out of the Sunken Stair`,
          metadata: { gameDate, depth },
        });
        await grantItem(tx, {
          userId,
          item: prizeEntry.item,
          quantity: 1,
          reason: "distribution",
          source: "cave:the-sunken-stair",
          transactionId: ledger.id,
          now: clock.now(),
        });
      }

      return {
        coinsAwarded: coinsToJSON(cache),
        prizeName: prizeEntry?.item.name ?? null,
      };
    },
  );

  const view = await getDelveView(db, { userId, clock });
  const step = view.steps[depth - 1] as CaveStepView;
  // Read off the rebuilt view rather than off locals the guards now own:
  // the step is the authoritative record of what happened, and on a
  // replay there are no locals to read at all.
  log.info("cave.chose", {
    userId,
    gameDate,
    depth,
    correct: step.correct,
    status: view.status,
    coins: result.coinsAwarded,
    prize: result.prizeName,
    replayed,
  });
  return {
    result: { view, step, ...result },
    replayed,
  };
}

/** One thing from the hoard, weighted, skipping anything withdrawn. */
async function drawHoard(db: DbClient | DbTx) {
  const entries = await db.caveHoardEntry.findMany({
    where: { active: true },
    include: { item: true },
  });
  const eligible = entries
    .filter((entry) => isDistributable(entry.item.lifecycle))
    .map((entry) => ({ ...entry, weight: entry.selectionWeight }));
  if (eligible.length === 0) {
    log.error("cave.hoard-empty", {});
    throw new CaveError("EMPTY_HOARD");
  }
  return pickWeighted(eligible);
}
