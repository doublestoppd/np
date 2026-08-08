import { z } from "zod";
import { descriptionSchema, displayNameSchema, slugSchema } from "./common";

/**
 * Ailments and remedies (ADR-60).
 *
 * The bounds here are the product rules in numeric form. An ailment that
 * could not end, could push health down, or could take a companion below
 * the floors would break "pets cannot die" and "no punitive inactivity" —
 * so none of those are expressible.
 */
export const ailmentKindSchema = z.object({
  key: slugSchema,
  name: displayNameSchema,
  symptom: descriptionSchema,
  /**
   * Required, and deliberately not defaulted. Every ailment must say, in
   * its own words, that nothing is broken — the first question a player
   * has is whether they have ruined something, and a missing reassurance
   * is a missing feature rather than a missing string.
   */
  comfort: descriptionSchema,
  /**
   * Hours until it passes untreated. Capped at three days: the free path
   * has to stay a real path, and an ailment a player cannot outwait is one
   * they have to pay to remove.
   */
  restHours: z.number().int().min(6).max(72),
  /** Extra happiness lost per hour. Small — this is a mood, not a tax. */
  happinessDrag: z.number().int().min(0).max(5).default(1),
  /**
   * Health ceiling while it lasts. At least 20 (the decay floor), so an
   * ailment can never combine with neglect to push a companion lower than
   * neglect alone already could.
   */
  healthCap: z.number().int().min(20).max(100).default(70),
  active: z.boolean().default(true),
});

export const remedySchema = z.object({
  itemSlug: slugSchema,
  /** Null settles anything — the broad tonic. */
  ailmentKey: slugSchema.nullable(),
  comfort: z.number().int().min(0).max(50).default(5),
});

export type AilmentKindContent = z.input<typeof ailmentKindSchema>;
export type RemedyContent = z.input<typeof remedySchema>;
