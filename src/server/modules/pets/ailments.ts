import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DbClient } from "@/server/db";
import { log } from "@/server/logging";
import { systemClock, type Clock } from "@/server/clock";
import { DomainError } from "@/server/errors";
import { rotationSecret } from "@/server/modules/daily/bands";
import { currentGameDate, type GameDate } from "@/server/modules/daily/game-day";
import { bondBand, BOND_BANDS } from "./bond";
import { NEED_DECAY_FLOOR } from "./pet-stats";

/**
 * Ailments (ADR-60).
 *
 * A companion can pick something up. It is temporary, it never takes
 * anything away permanently, and it always ends on its own — the whole
 * feature is built so that a player with no coins and no time is never
 * stuck, only slower.
 *
 * **Why this does not break "no punitive inactivity".** Three properties,
 * and each one is enforced rather than intended:
 *
 * 1. **At most one per companion per game day**, by unique constraint. A
 *    week away cannot stack seven ailments; it produces at most the one
 *    that is running when you get back, and probably not even that,
 *    because the earlier ones will have passed unattended.
 * 2. **Every ailment ends without treatment**, within three days at the
 *    outside (`restHours`, bounded by the content schema and a CHECK).
 *    Absence is therefore self-healing.
 * 3. **Nothing is confiscated and no stat is pushed down.** An ailment
 *    caps health rather than draining it, and adds a little to happiness
 *    decay. The floors underneath everything are unchanged.
 *
 * **The roll cannot be re-rolled.** It is an HMAC over (pet, game date)
 * keyed by the same server secret the rotation bands use, so refreshing
 * the page a hundred times asks the same question and gets the same
 * answer. Without that, "is my companion ill today" would be a slot
 * machine anybody could pull by pressing F5.
 */

export type AilmentErrorCode =
  | "PET_NOT_FOUND"
  | "NOT_A_REMEDY"
  | "NO_ITEM_IN_INVENTORY"
  | "NOTHING_TO_TREAT"
  | "WRONG_REMEDY";

const PUBLIC_MESSAGES: Record<AilmentErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  NOT_A_REMEDY: "That isn't a remedy.",
  NO_ITEM_IN_INVENTORY: "You don't have that remedy.",
  NOTHING_TO_TREAT:
    "There's nothing the matter — nothing was used. Keep it for when there is.",
  // Refused, not consumed. Nobody loses a bottle to a misread label.
  WRONG_REMEDY:
    "That one won't touch this. Nothing was used — the shed will know what does.",
};

export class AilmentError extends DomainError {
  constructor(public readonly ailmentCode: AilmentErrorCode) {
    super(ailmentCode, PUBLIC_MESSAGES[ailmentCode]);
    this.name = "AilmentError";
  }
}

/** Base likelihood on an ordinary day, in basis points. */
const BASE_CHANCE_BP = 900;
/** Most a badly kept coat can add. */
const COAT_PENALTY_BP = 600;
/** Most a long-standing bond can take off. */
const BOND_RELIEF_BP = 400;
/** Never impossible, and never likely. */
const MIN_CHANCE_BP = 200;
const MAX_CHANCE_BP = 1_500;
/** Coat at or above this contributes nothing at all. */
const COAT_COMFORTABLE = 60;
/** Most a long-standing bond can take off the recovery time. */
const BOND_RECOVERY_RELIEF = 0.25;

/**
 * A stable 0..9999 for this companion on this day.
 *
 * Keyed, not hashed: an unkeyed digest of a public pet id and a public
 * date is computable by anybody, which would turn "will my companion be
 * ill tomorrow" into a lookup. Same reasoning as ADR-44.
 */
function dailyRoll(petId: string, gameDate: GameDate, purpose: string): number {
  const digest = createHmac("sha256", rotationSecret())
    .update(`ailment:${purpose}:${petId}:${gameDate}`)
    .digest();
  return digest.readUInt32BE(0) % 10_000;
}

/**
 * How likely something is today, in basis points.
 *
 * Exported because it is the one piece of this worth testing directly,
 * and because the numbers are a balance decision somebody will want to
 * read without running the game.
 */
export function chanceBp({
  coat,
  bond,
}: {
  coat: number;
  bond: number;
}): number {
  // A poor coat adds, proportionally, between the floor and comfortable.
  const span = COAT_COMFORTABLE - NEED_DECAY_FLOOR;
  const shortfall = Math.min(
    1,
    Math.max(0, (COAT_COMFORTABLE - coat) / span),
  );
  const penalty = Math.round(COAT_PENALTY_BP * shortfall);

  // And a long bond takes off, by band rather than by raw number, so the
  // relief is legible: it improves when the description does.
  const index = BOND_BANDS.indexOf(bondBand(bond));
  const relief = Math.round(
    (BOND_RELIEF_BP * index) / Math.max(1, BOND_BANDS.length - 1),
  );

  return Math.min(
    MAX_CHANCE_BP,
    Math.max(MIN_CHANCE_BP, BASE_CHANCE_BP + penalty - relief),
  );
}

export interface AilmentView {
  key: string;
  name: string;
  symptom: string;
  comfort: string;
  startedAt: Date;
  /** When it passes on its own. */
  restsAt: Date;
  /** Health cannot sit above this while it lasts. */
  healthCap: number;
  happinessDrag: number;
}

/**
 * The ailment a companion has right now, or null.
 *
 * "Right now" means: recorded, not treated, and not yet past its own
 * `restsAt`. Nothing sweeps up expired rows — an ailment that has run its
 * course simply stops being current, which is what makes coming back after
 * a week free of consequences by construction rather than by a job.
 */
export async function currentAilment(
  db: DbClient,
  { petId, clock = systemClock }: { petId: string; clock?: Clock },
): Promise<AilmentView | null> {
  const now = clock.now();
  const row = await db.petAilment.findFirst({
    where: { petId, treatedAt: null, restsAt: { gt: now } },
    include: { kind: true },
    orderBy: { startedAt: "desc" },
  });
  if (!row) return null;
  return {
    key: row.kind.key,
    name: row.kind.name,
    symptom: row.kind.symptom,
    comfort: row.kind.comfort,
    startedAt: row.startedAt,
    restsAt: row.restsAt,
    healthCap: row.kind.healthCap,
    happinessDrag: row.kind.happinessDrag,
  };
}

/**
 * Draws today's ailment, if today has one.
 *
 * Lazy, on read, like the lantern's hunt — there is no cron here and there
 * does not need to be, because an ailment nobody looked at may as well not
 * have happened. The unique constraint makes a concurrent double-draw
 * impossible, and a loser simply returns what the winner wrote.
 */
export async function ensureAilmentForToday(
  db: DbClient,
  {
    petId,
    coat,
    bond,
    clock = systemClock,
  }: { petId: string; coat: number; bond: number; clock?: Clock },
): Promise<AilmentView | null> {
  const now = clock.now();
  const gameDate = currentGameDate(clock);

  const already = await db.petAilment.findUnique({
    where: { petId_gameDate: { petId, gameDate } },
  });
  if (already) {
    return currentAilment(db, { petId, clock });
  }

  if (dailyRoll(petId, gameDate, "onset") >= chanceBp({ coat, bond })) {
    return null;
  }

  const kinds = await db.ailmentKind.findMany({
    where: { active: true },
    orderBy: { key: "asc" },
  });
  if (kinds.length === 0) {
    // Content is missing. A companion with no possible ailment is simply
    // a healthy companion, which is a fine failure mode — never an error
    // in front of a player looking at their pet.
    log.warn("ailment.no-kinds", {});
    return null;
  }
  const kind = kinds[dailyRoll(petId, gameDate, "kind") % kinds.length]!;

  // A long bond shortens the wait. Never below a quarter of a day, so an
  // ailment is always something that happened rather than a flicker.
  const bandIndex = BOND_BANDS.indexOf(bondBand(bond));
  const relief =
    (BOND_RECOVERY_RELIEF * bandIndex) / Math.max(1, BOND_BANDS.length - 1);
  const hours = Math.max(6, kind.restHours * (1 - relief));

  try {
    await db.petAilment.create({
      data: {
        petId,
        kindId: kind.id,
        gameDate,
        startedAt: now,
        restsAt: new Date(now.getTime() + hours * 3_600_000),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Another request drew first. Theirs is the one that happened.
      return currentAilment(db, { petId, clock });
    }
    throw error;
  }
  log.info("ailment.began", { petId, gameDate, kind: kind.key });
  return currentAilment(db, { petId, clock });
}

/**
 * Applies an ailment's effects to a stat snapshot.
 *
 * CAPS health, never lowers it, and adds a little to the happiness already
 * lost. Both directions matter: a companion that got iller the longer you
 * left it would make absence expensive, which is the thing this whole
 * feature has to avoid.
 */
export function applyAilment(
  stats: { hunger: number; happiness: number; energy: number; health: number; coat?: number },
  ailment: AilmentView | null,
  { from, now }: { from: Date; now: Date },
): typeof stats {
  if (!ailment) return stats;
  const hours = Math.max(0, (now.getTime() - from.getTime()) / 3_600_000);
  const drag = ailment.happinessDrag * hours;
  return {
    ...stats,
    // Floors first: an ailment must never take a companion below what
    // ordinary neglect already floors at.
    happiness: Math.round(
      Math.max(Math.min(stats.happiness, NEED_DECAY_FLOOR), stats.happiness - drag),
    ),
    health: Math.min(stats.health, ailment.healthCap),
  };
}
