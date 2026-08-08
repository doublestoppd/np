import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { DomainError } from "@/server/errors";
import { rotationSecret } from "@/server/modules/daily/bands";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { grantItem } from "@/server/modules/items/ownership";
import { bondBand, BOND_BANDS } from "./bond";
import { enforcePetCareRateLimit } from "./config";

/**
 * Keepsakes (ADR-61).
 *
 * A companion who is well looked after and has known you a while will
 * occasionally turn up with something and put it in front of you. It is
 * worth two coins. That is the point.
 *
 * **Why this is not a faucet.** One per companion per game day by unique
 * constraint, drawn from a pool where nothing is worth more than six
 * coins, gated on a bond that only care produces. A player farming this
 * optimally earns about four coins a day and a satchel full of pebbles.
 * If it ever pays enough to be worth optimising, it has stopped being what
 * it is for.
 *
 * **Why it is not a chore either.** A keepsake waits indefinitely — there
 * is no expiry, no "claim within 24 hours", and no streak. And only ever
 * one waits: a companion with something already set out does not go and
 * find another, so coming back after a fortnight finds the one thing that
 * was waiting rather than fourteen things you failed to collect.
 *
 * That last rule is enforced in `ensureKeepsakeForToday` rather than by
 * the schema, and it had to be written down before it was true — the
 * per-day unique constraint stops two arriving on one day and does
 * nothing at all about fourteen arriving over fourteen days.
 *
 * **The draw cannot be re-rolled.** Same construction as the ailment: an
 * HMAC over (pet, game date) keyed by the server secret, so refreshing
 * asks the same question and gets the same answer. Without that, "did my
 * companion find something today" would be a slot machine you pull with
 * F5 — and this feature in particular has to be about them, not about you
 * pressing something.
 */

export type KeepsakeErrorCode =
  | "PET_NOT_FOUND"
  | "NOTHING_WAITING"
  | "ALREADY_TAKEN";

const PUBLIC_MESSAGES: Record<KeepsakeErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  NOTHING_WAITING: "There's nothing waiting just now.",
  ALREADY_TAKEN: "You already have that one — it's in the satchel.",
};

export class KeepsakeError extends DomainError {
  constructor(public readonly keepsakeCode: KeepsakeErrorCode) {
    super(keepsakeCode, PUBLIC_MESSAGES[keepsakeCode]);
    this.name = "KeepsakeError";
  }
}

/** Likelihood on a given day, in basis points, at the very best. */
const MAX_CHANCE_BP = 3_500;
/** And at the bottom of the ladder, where it is nothing at all. */
const MIN_BOND_BAND = 1;
/** Neither of these is a hard gate — see `chanceBp`. */
const HAPPINESS_FLOOR = 35;
const HUNGER_FLOOR = 25;

/**
 * How likely a companion is to turn something up today.
 *
 * Zero below the first bond band, and zero for a companion who is hungry
 * or in poor spirits — not as a punishment, but because a companion who
 * needs something is not out finding you presents, and a gift arriving on
 * the day you forgot to feed them would read as the game letting you off.
 *
 * Exported because it is the one balance number here worth reading without
 * running the game.
 */
export function chanceBp({
  bond,
  happiness,
  hunger,
}: {
  bond: number;
  happiness: number;
  hunger: number;
}): number {
  const band = BOND_BANDS.indexOf(bondBand(bond));
  if (band < MIN_BOND_BAND) return 0;
  if (happiness < HAPPINESS_FLOOR || hunger < HUNGER_FLOOR) return 0;
  // Rises with the band, so the longer you have had each other the more
  // often it happens — which is the only progression this feature has.
  const steps = BOND_BANDS.length - 1 - MIN_BOND_BAND;
  return Math.round(
    (MAX_CHANCE_BP * (band - MIN_BOND_BAND + 1)) / Math.max(1, steps + 1),
  );
}

function dailyRoll(petId: string, gameDate: GameDate, purpose: string): number {
  const digest = createHmac("sha256", rotationSecret())
    .update(`keepsake:${purpose}:${petId}:${gameDate}`)
    .digest();
  return digest.readUInt32BE(0) % 10_000;
}

export interface KeepsakeView {
  id: string;
  itemId: string;
  itemName: string;
  itemSlug: string;
  artKey: string | null;
  categorySlug: string | null;
  /** How they came by it. Frozen at the draw. */
  line: string;
  drawnAt: Date;
}

/**
 * What is waiting to be picked up, or null.
 *
 * Not scoped to today: a keepsake from last Tuesday that nobody picked up
 * is still sitting there, because nothing in this game expires quietly.
 */
export async function waitingKeepsake(
  db: DbClient,
  { petId }: { petId: string },
): Promise<KeepsakeView | null> {
  const row = await db.petKeepsake.findFirst({
    where: { petId, takenAt: null },
    include: { kind: { include: { item: { include: { category: true } } } } },
    orderBy: { drawnAt: "asc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    itemId: row.kind.itemId,
    itemName: row.kind.item.name,
    itemSlug: row.kind.item.slug,
    artKey: row.kind.item.artKey,
    categorySlug: row.kind.item.category?.slug ?? null,
    line: row.line,
    drawnAt: row.drawnAt,
  };
}

/**
 * Draws today's keepsake, if today has one.
 *
 * Lazy on read, like the ailment and the lantern's hunt: nothing here
 * needs a cron, and a keepsake nobody looked at may as well not have
 * happened. Writes the row only — the item does not move until the player
 * picks it up.
 */
export async function ensureKeepsakeForToday(
  db: DbClient,
  {
    petId,
    bond,
    happiness,
    hunger,
    clock = systemClock,
  }: {
    petId: string;
    bond: number;
    happiness: number;
    hunger: number;
    clock?: Clock;
  },
): Promise<KeepsakeView | null> {
  const gameDate = currentGameDate(clock);

  // Something is already set out. A companion does not pile up presents
  // nobody picked up, and a returning player must never be met with a
  // backlog — see the note above.
  const waiting = await waitingKeepsake(db, { petId });
  if (waiting) return waiting;

  const already = await db.petKeepsake.findUnique({
    where: { petId_gameDate: { petId, gameDate } },
  });
  if (already) return null;

  if (dailyRoll(petId, gameDate, "found") >= chanceBp({ bond, happiness, hunger })) {
    return waitingKeepsake(db, { petId });
  }

  const kinds = await db.keepsakeKind.findMany({
    where: { active: true },
    orderBy: { id: "asc" },
  });
  if (kinds.length === 0) {
    // Content is missing. A companion who found nothing is a perfectly
    // ordinary companion — never an error in front of somebody looking at
    // their pet.
    log.warn("keepsake.no-kinds", {});
    return waitingKeepsake(db, { petId });
  }

  const total = kinds.reduce((sum, kind) => sum + kind.weight, 0);
  let ticket = dailyRoll(petId, gameDate, "which") % total;
  const chosen =
    kinds.find((kind) => (ticket -= kind.weight) < 0) ?? (kinds[0] as (typeof kinds)[number]);

  try {
    await db.petKeepsake.create({
      data: {
        petId,
        kindId: chosen.id,
        gameDate,
        // Frozen: retiring a keepsake from content must never change a
        // sentence somebody has already read.
        line: chosen.line,
      },
    });
    log.info("keepsake.found", { petId, gameDate, kind: chosen.id });
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error;
    }
    // Another request drew first. Theirs is the one that happened.
  }
  return waitingKeepsake(db, { petId });
}

export type TakeKeepsakeResult = {
  itemName: string;
  itemSlug: string;
  line: string;
  petName: string;
};

/**
 * Picks up what was left for you.
 *
 * A deliberate tap rather than an automatic grant. Rendering a page must
 * never put something in a satchel — that is the rule the cave's read-only
 * view follows too — and there is a smaller reason as well: being handed
 * something is a moment, and a moment needs an action.
 */
export async function takeKeepsake(
  db: DbClient,
  {
    userId,
    petId,
    keepsakeId,
    idempotencyKey,
    clock = systemClock,
  }: {
    userId: string;
    petId: string;
    keepsakeId: string;
    idempotencyKey: string;
    clock?: Clock;
  },
): Promise<{ result: TakeKeepsakeResult; replayed: boolean }> {
  const now = clock.now();
  await enforcePetCareRateLimit(db, "take-keepsake", userId, now);
  return withIdempotency<TakeKeepsakeResult>(
    db,
    {
      userId,
      operation: "take-keepsake",
      key: idempotencyKey,
      requestHash: requestHash({ petId, keepsakeId }),
    },
    async (tx) => {
      const pet = await tx.pet.findUnique({ where: { id: petId } });
      if (!pet || pet.ownerId !== userId) {
        throw new KeepsakeError("PET_NOT_FOUND");
      }

      const row = await tx.petKeepsake.findUnique({
        where: { id: keepsakeId },
        include: { kind: { include: { item: true } } },
      });
      if (!row || row.petId !== petId) {
        throw new KeepsakeError("NOTHING_WAITING");
      }
      if (row.takenAt !== null) {
        throw new KeepsakeError("ALREADY_TAKEN");
      }

      // Guarded: the update is the claim. Two taps race here and exactly
      // one of them moves an item, because the loser matches no rows.
      const claimed = await tx.petKeepsake.updateMany({
        where: { id: keepsakeId, takenAt: null },
        data: { takenAt: now },
      });
      if (claimed.count === 0) {
        throw new KeepsakeError("ALREADY_TAKEN");
      }

      await grantItem(tx, {
        userId,
        item: row.kind.item,
        quantity: 1,
        // A new copy entering circulation, so the kill switch applies:
        // retiring a keepsake stops companions handing it out, and never
        // touches the ones already in somebody's satchel.
        reason: "distribution",
        source: `keepsake:${pet.name}`,
        now,
      });

      log.info("keepsake.taken", { userId, petId, item: row.kind.item.slug });

      return {
        itemName: row.kind.item.name,
        itemSlug: row.kind.item.slug,
        line: row.line,
        petName: pet.name,
      };
    },
  );
}
