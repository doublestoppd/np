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
import { furnishingSchema } from "./hollow";

/** Items in this category are placed in a Hollow rather than used. */
export const FURNISHING_CATEGORY = "furnishings";

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
    type: z.enum(["FOOD", "TOY", "SCRATCH_CARD"]).nullable(),
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
    /** Present exactly on furnishings; see ./hollow.ts. */
    furnishing: furnishingSchema.optional(),
  })
  .superRefine((item, ctx) => {
    const isFurnishing = item.category === FURNISHING_CATEGORY;
    if (isFurnishing !== (item.furnishing !== undefined)) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": the furnishing block and the "${FURNISHING_CATEGORY}" category must be used together`,
      });
    }
    if (isFurnishing && item.type !== null) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": a furnishing is placed, not used — its type must be null`,
      });
    }
    // A furnishing that can be resold recycles coins instead of burning
    // them, which is the whole point of the sink; it also invites buying
    // for speculation rather than because you liked the thing.
    if (isFurnishing && item.tradeable !== false) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": furnishings must set tradeable: false`,
      });
    }
    // Rarity ranks, and a ranked catalogue quietly tells the player which
    // things are worth wanting. A Hollow is composition, not acquisition:
    // the only ordering the catalogue ever shows is price.
    if (isFurnishing && item.rarity !== undefined && item.rarity !== "COMMON") {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": furnishings carry no rarity tier — leave it COMMON`,
      });
    }
    // A furnishing is placed by definition, not by copy: owning five stones
    // means placing five stones, which is what makes buying a sixth sane.
    if (isFurnishing && item.stackable === false) {
      ctx.addIssue({
        code: "custom",
        message: `item "${item.slug}": furnishings are stackable — the same object is meant to be owned many times`,
      });
    }
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

/**
 * A scratch card's prize table. Weights are basis points; the active ones
 * must sum to exactly 10000 per card (checked in prisma/seed/validation.ts
 * along with the expected-value ceiling that keeps a card a sink).
 */
export const scratchPrizeSchema = z
  .object({
    label: displayNameSchema,
    kind: z.enum(["COINS", "ITEM", "NOTHING", "JACKPOT"]),
    weight: z.number().int().min(1).max(10_000),
    coins: coinsSchema.optional(),
    itemSlug: slugSchema.optional(),
    quantity: z.number().int().min(1).max(20).default(1),
    active: z.boolean().default(true),
  })
  .superRefine((prize, ctx) => {
    if (prize.kind === "NOTHING" || prize.kind === "JACKPOT") {
      // A loss pays nothing by definition; the jackpot pays whatever the
      // pool stands at, which is not a number an author can write down.
      if (prize.coins !== undefined || prize.itemSlug !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `prize "${prize.label}": ${prize.kind} outcomes carry no payload`,
        });
      }
      return;
    }
    if (prize.kind === "COINS") {
      if (prize.coins === undefined || prize.coins <= 0n) {
        ctx.addIssue({
          code: "custom",
          message: `prize "${prize.label}": COINS outcomes need a positive coin amount`,
        });
      }
      if (prize.itemSlug !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `prize "${prize.label}": COINS outcomes cannot name an item`,
        });
      }
    } else {
      if (prize.itemSlug === undefined) {
        ctx.addIssue({
          code: "custom",
          message: `prize "${prize.label}": ITEM outcomes need an itemSlug`,
        });
      }
      if (prize.coins !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `prize "${prize.label}": ITEM outcomes cannot also pay coins`,
        });
      }
    }
  });

export const scratchCardSchema = z.object({
  itemSlug: slugSchema,
  tier: z.number().int().min(1).max(3),
  /**
   * Basis points of the card's price added to the shared pool on every
   * scratch. Counted against the expected-return ceiling, because coins
   * put in a pool are coins that come back out of it.
   */
  jackpotBps: z.number().int().min(0).max(2_000).default(0),
  /** At least two outcomes; a one-outcome card is a vending machine. */
  prizes: z.array(scratchPrizeSchema).min(2),
});

export type ScratchPrizeContent = z.input<typeof scratchPrizeSchema>;
export type ScratchCardContent = z.input<typeof scratchCardSchema>;

export type ItemCategoryContent = z.infer<typeof itemCategorySchema>;
export type ItemTagContent = z.infer<typeof itemTagSchema>;
export type ItemContent = z.input<typeof itemSchema>;
