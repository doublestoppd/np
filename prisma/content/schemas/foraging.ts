import { z } from "zod";
import { descriptionSchema, displayNameSchema, slugSchema } from "./common";

/**
 * Foraging spots: a weighted pool of ordinary items attached to a
 * location. A spot never yields coins — what a place gives you is a
 * thing, and turning it into money is the market's job, not the
 * hedgerow's.
 *
 * Weights are relative within a spot and deliberately not normalized to a
 * fixed total (unlike wheel prizes, which must sum to 10,000): a spot's
 * pool is edited by adding and removing lines, and forcing a re-balance of
 * every other line to add one would make authoring miserable.
 */
export const forageEntrySchema = z
  .object({
    itemSlug: slugSchema,
    /** Relative likelihood within this spot. Higher is commoner. */
    selectionWeight: z.number().int().min(1).max(10_000),
    minQuantity: z.number().int().min(1).max(20).default(1),
    maxQuantity: z.number().int().min(1).max(20).default(1),
    active: z.boolean().default(true),
  })
  .refine((entry) => (entry.maxQuantity ?? 1) >= (entry.minQuantity ?? 1), {
    message: "maxQuantity must be at least minQuantity",
    path: ["maxQuantity"],
  });

export const forageSpotSchema = z.object({
  slug: slugSchema,
  regionSlug: slugSchema,
  locationSlug: slugSchema,
  name: displayNameSchema,
  /** Fixed flavor copy shown above the search button. Presentation only. */
  description: descriptionSchema,
  /**
   * Searches per player per UTC game day. Reaching it defers work to
   * tomorrow and takes nothing away — never a punishment for being late.
   */
  dailyLimit: z.number().int().min(1).max(20),
  active: z.boolean().default(true),
  /**
   * Relative weight of turning up nothing, alongside the entry weights.
   * Some searches finding nothing is what stops a spot being a dispenser,
   * and the flavour line is its own small reward — but it stays a modest
   * slice, because at three searches a day a mostly-empty hedgerow is
   * just an annoying button.
   */
  nothingWeight: z.number().int().min(0).max(10_000).default(0),
  /** Newline-joined lines, one picked at random. Same shape as the wheel. */
  nothingFlavor: z.string().trim().max(2_000).default(""),
  entries: z.array(forageEntrySchema).min(1),
});

export type ForageEntryContent = z.input<typeof forageEntrySchema>;
export type ForageSpotContent = z.input<typeof forageSpotSchema>;
