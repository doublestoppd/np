import type { PetStat } from "@/lib/pet-condition";

/**
 * The random-event definition format.
 *
 * Definitions are declarative data, not code: an event says what it *is*
 * and what it *does*, and the orchestration in `roll.ts` never learns any
 * event's name. Adding an event is a catalog edit; adding a new kind of
 * consequence is an entry in the effect registry (`effects.ts`). Neither
 * touches the roll.
 *
 * Definitions live in the domain module rather than `prisma/content/`
 * because they are never seeded into the database — the catalog is code,
 * and occurrences freeze their resolved text so history survives retuning.
 * Offline validation still covers them (`prisma/seed/validation.ts`), the
 * same way it covers the starter pack.
 */

/** Flavour category, for presentation and operator analytics only. */
export type RandomEventCategory =
  | "discovery"
  | "companion"
  | "mishap"
  | "grove";

/** Presentation rarity. Independent of weight; used for the badge shown. */
export type RandomEventRarity = "common" | "uncommon" | "rare" | "legendary";

/**
 * A declarative consequence. Every variant is resolved server-side and
 * applied through the existing economy helpers — no effect performs its
 * own wallet or inventory arithmetic.
 */
export type RandomEventEffect =
  /** Coins credited through the wallet, with a ledger row. Inclusive range. */
  | { kind: "coins"; min: number; max: number }
  /** One item definition, granted through the ownership boundary. */
  | { kind: "item"; slug: string; quantity?: number }
  /** Nudges one stat on the player's companion. Clamped, never fatal. */
  | { kind: "petStat"; stat: PetStat; delta: number }
  /** Nothing happens. A story is still a thing that happened. */
  | { kind: "flavor" };

/**
 * Optional gates. All present rules must pass. Absent rules mean "always",
 * so the common case stays a two-line definition.
 */
export type RandomEventEligibility = {
  /**
   * Restricts the event to routes under these prefixes. Used for
   * location-aware flavour; the prefixes are checked against the same
   * normalized path the route allow-list uses.
   */
  routePrefixes?: string[];
  /** Requires the player to have adopted a companion. */
  requiresPet?: boolean;
  /**
   * Keeps an event away from brand-new accounts. Rare finds in the first
   * minutes read as scripted rather than lucky.
   */
  minAccountAgeHours?: number;
};

export type RandomEventDefinition = {
  /** Stable identity. Referenced by occurrences forever; never reused. */
  key: string;
  title: string;
  /**
   * Player-facing body. Supports `{pet}` for the companion's name and
   * `{player}` for the username; placeholders resolve server-side and the
   * resolved string is what gets stored.
   */
  message: string;
  /** Relative selection weight within the eligible pool. Must be > 0. */
  weight: number;
  /** A disabled event is inert everywhere: never selected, never shown. */
  enabled: boolean;
  category: RandomEventCategory;
  rarity: RandomEventRarity;
  /**
   * Per-event cooldown in minutes. Suppresses only this event, on top of
   * the global cooldown — so a legendary find cannot land twice in a day
   * even if the global cooldown has expired.
   */
  cooldownMinutes?: number;
  eligibility?: RandomEventEligibility;
  /** At least one. Applied in order, all inside the roll's transaction. */
  effects: RandomEventEffect[];
};

/** An effect after selection, with every random quantity already decided. */
export type ResolvedEffect =
  | { kind: "coins"; amount: string }
  | { kind: "item"; slug: string; name: string; quantity: number }
  | { kind: "petStat"; stat: PetStat; delta: number; petName: string }
  | { kind: "flavor" };

/**
 * What an occurrence stores and what the player is shown. Frozen at write
 * time — nothing here is ever re-derived from the catalog.
 */
export type ResolvedEventPayload = {
  eventKey: string;
  title: string;
  message: string;
  category: RandomEventCategory;
  rarity: RandomEventRarity;
  effects: ResolvedEffect[];
  /** One-line summary of what the player received, or "" for flavour. */
  rewardSummary: string;
};
