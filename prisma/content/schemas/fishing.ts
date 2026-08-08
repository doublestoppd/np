import { z } from "zod";
import { descriptionSchema, displayNameSchema, slugSchema } from "./common";

/**
 * Fishing spots. Close cousins of forage spots, and separate for one
 * reason: a cast yields exactly ONE fish with a LENGTH drawn from that
 * species' range in that water, and the length is the activity.
 *
 * Ranges live on the entry rather than on the item because the same
 * species runs bigger in deeper water. That is the whole reason a second
 * tarn exists (ADR-47).
 */
export const fishingEntrySchema = z
  .object({
    itemSlug: slugSchema,
    /** Relative likelihood within this spot. Higher is commoner. */
    selectionWeight: z.number().int().min(1).max(10_000),
    /** Length range in centimetres, inclusive. */
    minLength: z.number().int().min(1).max(400),
    maxLength: z.number().int().min(1).max(400),
    active: z.boolean().default(true),
  })
  .refine((entry) => entry.maxLength >= entry.minLength, {
    message: "maxLength must be at least minLength",
    path: ["maxLength"],
  });

export const fishingSpotSchema = z.object({
  slug: slugSchema,
  regionSlug: slugSchema,
  locationSlug: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  /** Casts per player per UTC game day. */
  dailyLimit: z.number().int().min(1).max(20),
  active: z.boolean().default(true),
  /**
   * Relative weight of an empty cast, drawn from the same table as the
   * fish. Higher than a forage spot's on purpose: waiting is what fishing
   * is, and a hook that always lands something is a vending machine.
   */
  emptyWeight: z.number().int().min(0).max(10_000).default(0),
  /** Newline-joined lines, one picked at random. */
  emptyFlavor: z.string().trim().max(2_000).default(""),
  entries: z.array(fishingEntrySchema).min(1),
});

export type FishingEntryContent = z.input<typeof fishingEntrySchema>;
export type FishingSpotContent = z.input<typeof fishingSpotSchema>;
