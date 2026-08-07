import type { DbClient } from "@/server/db";
import { DomainError } from "@/server/errors";
import { applyStatDecay, clampStat, STAT_MAX } from "./pet-stats";
import { isUsable } from "@/server/modules/items/lifecycle";
import { recordLedger } from "@/server/modules/commerce/ledger";
import { isDelight, palateFor, reactionFor, toyHappiness, type PetReaction } from "./palate";
import { rememberDelight } from "./fondness";
import { enforcePetCareRateLimit } from "./config";
import { requestHash, withIdempotency } from "@/server/security/idempotency";
import { PLAY_COOLDOWN_MINUTES, PLAY_ENERGY_COST } from "./play-config";

export type PlayErrorCode =
  | "PET_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "NOT_A_TOY"
  | "NO_ITEM_IN_INVENTORY"
  | "TOY_RESTING"
  | "PET_DELIGHTED"
  | "CONCURRENT_PLAY";

const PUBLIC_MESSAGES: Record<PlayErrorCode, string> = {
  PET_NOT_FOUND: "That companion could not be found.",
  ITEM_NOT_FOUND: "That item could not be found.",
  NOT_A_TOY: "That isn't something your companion can play with.",
  NO_ITEM_IN_INVENTORY: "You don't have that plaything.",
  TOY_RESTING:
    "That one has lost its novelty for now. Try something else — variety is the point.",
  PET_DELIGHTED:
    "Your companion could not possibly be happier right now. Nothing was used.",
  CONCURRENT_PLAY: "That happened twice at once — nothing changed. Try again.",
};

export class PlayError extends DomainError {
  constructor(public readonly playCode: PlayErrorCode) {
    super(playCode, PUBLIC_MESSAGES[playCode]);
    this.name = "PlayError";
  }
}

export interface PlayWithPetParams {
  userId: string;
  petId: string;
  itemId: string;
  idempotencyKey: string;
  now?: Date;
}

/** JSON-safe result, stored as the idempotency replay payload. */
export type PlayWithPetResult = {
  petId: string;
  petName: string;
  itemName: string;
  /** What this companion made of it. Never says why (see ./palate.ts). */
  reaction: PetReaction;
  hunger: number;
  happiness: number;
  energy: number;
  health: number;
};

/**
 * Plays with a companion using a toy the player owns.
 *
 * This is the verb happiness never had. Before it, `Item.happinessBoost`
 * was written by the seeder and read by nothing: five toys were on sale,
 * one shipped in every starter pack, and happiness fell 3/hour with no way
 * to raise it — so a player doing everything right still watched the home
 * page tell them their companion was "Downcast — out of sorts and in need
 * of company", with no button anywhere in the product.
 *
 * **Toys are not consumed.** A toy is a possession, not a snack. Keeping
 * it means owning several is what sustains a companion's spirits, which
 * makes toys worth buying, keeping, showing off, and trading — and avoids
 * a treadmill where happiness is a coin drain that scales with how much
 * you care. The limiter instead is a per-(pet, toy) cooldown: the same
 * plaything twice in a row does nothing, a different one works. Variety,
 * not spend.
 *
 * Playing costs energy, which is the other half of the loop: energy is
 * what recovers on its own (`applyStatDecay` regenerates it while the
 * companion is fed), so play spends it and rest restores it. It is
 * deliberately NOT a gate — a tired companion still plays and still gains
 * the full happiness; the cost simply floors at zero (CLAUDE.md forbids
 * energy gating play).
 */
export async function playWithPet(
  db: DbClient,
  { userId, petId, itemId, idempotencyKey, now = new Date() }: PlayWithPetParams,
): Promise<{ result: PlayWithPetResult; replayed: boolean }> {
  await enforcePetCareRateLimit(db, "play-with-pet", userId, now);
  return withIdempotency<PlayWithPetResult>(
    db,
    {
      userId,
      operation: "play-with-pet",
      key: idempotencyKey,
      requestHash: requestHash({ petId, itemId }),
    },
    async (tx) => {
      const owned = await tx.pet.findUnique({
        where: { id: petId },
        select: { id: true, ownerId: true },
      });
      if (!owned || owned.ownerId !== userId) {
        // Reported identically to a missing pet so ids cannot be probed.
        throw new PlayError("PET_NOT_FOUND");
      }

      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { tags: { select: { slug: true } } },
      });
      if (!item) {
        throw new PlayError("ITEM_NOT_FOUND");
      }
      if (item.type !== "TOY" || (item.happinessBoost ?? 0) <= 0) {
        throw new PlayError("NOT_A_TOY");
      }
      if (!isUsable(item.lifecycle)) {
        throw new PlayError("ITEM_NOT_FOUND");
      }

      // The toy is not consumed, so ownership is a check rather than a
      // decrement. Stackable toys count by inventory row; an instanced toy
      // would count by owned instance.
      const entry = await tx.inventoryEntry.findUnique({
        where: { userId_itemId: { userId, itemId } },
      });
      if (!entry || entry.quantity < 1) {
        throw new PlayError("NO_ITEM_IN_INVENTORY");
      }

      // Claim the cooldown for this (pet, toy) pair. The guarded upsert is
      // both the novelty rule and the concurrency winner-picker: two
      // simultaneous plays with the same toy cannot both land.
      const readyAt = new Date(now.getTime() - PLAY_COOLDOWN_MINUTES * 60_000);
      const claimed = await tx.petToyUse.updateMany({
        where: { petId: owned.id, itemId, lastUsedAt: { lte: readyAt } },
        data: { lastUsedAt: now },
      });
      if (claimed.count === 0) {
        const existing = await tx.petToyUse.findUnique({
          where: { petId_itemId: { petId: owned.id, itemId } },
        });
        if (existing) {
          throw new PlayError("TOY_RESTING");
        }
        // First time with this toy: the create is the claim, and a
        // concurrent duplicate loses on the unique constraint.
        await tx.petToyUse.create({
          data: { petId: owned.id, itemId, lastUsedAt: now },
        });
      }

      // Stats are read only after the cooldown is claimed, and written
      // under a guard on the snapshot timestamp — the same discipline
      // feeding uses, so a simultaneous feed cannot be silently discarded.
      const pet = await tx.pet.findUniqueOrThrow({ where: { id: owned.id } });
      const current = applyStatDecay(pet, pet.statsUpdatedAt, now);
      if (current.happiness >= STAT_MAX) {
        // Nothing to gain, and the toy's novelty should not be spent on a
        // no-op. Rolls back the cooldown claim with everything else.
        throw new PlayError("PET_DELIGHTED");
      }
      // A toy this companion loves is worth more than the same toy to
      // another one — but never less, so an indifference costs the player
      // nothing they paid for (./palate.ts).
      const reaction = reactionFor(palateFor(pet.palateSeed), pet.palateSeed, {
        slug: item.slug,
        tagSlugs: item.tags.map((tag) => tag.slug),
        kind: "TOY",
      });
      const nextStats = {
        ...current,
        happiness: clampStat(
          current.happiness + toyHappiness(reaction, item.happinessBoost ?? 0),
        ),
        energy: clampStat(current.energy - PLAY_ENERGY_COST),
      };

      const applied = await tx.pet.updateMany({
        where: { id: pet.id, statsUpdatedAt: pet.statsUpdatedAt },
        data: { ...nextStats, statsUpdatedAt: now },
      });
      if (applied.count === 0) {
        throw new PlayError("CONCURRENT_PLAY");
      }

      // No coins and no items move, but the interaction belongs in the
      // player's history beside feeding.
      if (isDelight(reaction)) {
        await rememberDelight(tx, { petId: pet.id, itemId: item.id, now });
      }

      await recordLedger(tx, {
        userId,
        type: "ITEM_USE",
        itemId: item.id,
        petId: pet.id,
        quantity: 1,
        note: `Played with ${pet.name} using ${item.name}`,
      });

      return {
        petId: pet.id,
        petName: pet.name,
        itemName: item.name,
        reaction,
        ...nextStats,
      };
    },
  );
}
