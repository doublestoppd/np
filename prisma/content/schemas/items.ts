import { z } from "zod";
import {
  artKeySchema,
  coinsSchema,
  descriptionSchema,
  displayNameSchema,
  lifecycleSchema,
  raritySchema,
  slugSchema,
} from "./common";

export const itemCategorySchema = z.object({
  slug: slugSchema,
  name: displayNameSchema,
  description: z.string().trim().max(400).default(""),
  sortOrder: z.number().int().min(0),
});

export const itemTagSchema = z.object({
  slug: slugSchema,
  name: displayNameSchema,
});

export const itemSchema = z
  .object({
    slug: slugSchema,
    name: displayNameSchema,
    description: descriptionSchema,
    /** Typed gameplay use effect; null = no use effect (ADR-1). */
    type: z.enum(["FOOD", "TOY"]).nullable(),
    /** Category slug (display grouping, never prescriptive). */
    category: slugSchema,
    /** Descriptive tag slugs. */
    tags: z.array(slugSchema).max(8),
    /** Estimated base value in coins; shops price independently. */
    price: coinsSchema,
    rarity: raritySchema,
    lifecycle: lifecycleSchema.default("ACTIVE"),
    tradeable: z.boolean().default(true),
    stackable: z.boolean().default(true),
    provenancePolicy: z
      .enum(["NONE", "ORIGINAL_SOURCE", "FULL_HISTORY"])
      .default("NONE"),
    artKey: artKeySchema,
    hungerRestore: z.number().int().min(1).max(100).optional(),
    happinessBoost: z.number().int().min(1).max(100).optional(),
  })
  .superRefine((item, ctx) => {
    if (item.provenancePolicy !== "NONE" && item.stackable) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": provenance tracking requires stackable: false`,
      });
    }
    if (item.type === "FOOD" && item.hungerRestore === undefined) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": FOOD items need hungerRestore`,
      });
    }
    if (item.type !== "FOOD" && item.hungerRestore !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": hungerRestore is only valid on FOOD items`,
      });
    }
    if (item.type !== "TOY" && item.happinessBoost !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": happinessBoost is only valid on TOY items`,
      });
    }
  });

export type ItemCategoryContent = z.infer<typeof itemCategorySchema>;
export type ItemTagContent = z.infer<typeof itemTagSchema>;
export type ItemContent = z.input<typeof itemSchema>;
