import { z } from "zod";
import {
  artKeySchema,
  coinsSchema,
  descriptionSchema,
  displayNameSchema,
  raritySchema,
  slugSchema,
} from "./common";

export const npcPoolEntrySchema = z
  .object({
    itemSlug: slugSchema,
    /** Shop-specific rarity; may differ from the item's general rarity. */
    shopRarity: raritySchema,
    price: coinsSchema,
    weight: z.number().int().min(1).max(100_000),
    minQuantity: z.number().int().min(1),
    maxQuantity: z.number().int().min(1),
    /** ISO instant after which the entry stops restocking. */
    availableUntil: z.iso.datetime().optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.minQuantity > entry.maxQuantity) {
      ctx.addIssue({
        code: "custom",
        message: `pool entry "${entry.itemSlug}": minQuantity exceeds maxQuantity`,
      });
    }
  });

export const npcShopSchema = z.object({
  slug: slugSchema,
  /** Locations are addressed by region + location slug: location slugs
   *  are only unique within their region, never globally. */
  regionSlug: slugSchema,
  locationSlug: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  keeperCopy: z.string().trim().max(400).default(""),
  keeperArtKey: artKeySchema.optional(),
  artKey: artKeySchema.optional(),
  /** Restock schedule/composition overrides; omitted fields use defaults. */
  config: z
    .object({
      intervalMinutes: z.number().int().min(1).optional(),
      targetListings: z.number().int().min(1).optional(),
      commonMin: z.number().int().min(0).optional(),
      commonMax: z.number().int().min(0).optional(),
      uncommonMin: z.number().int().min(0).optional(),
      uncommonMax: z.number().int().min(0).optional(),
      rareMin: z.number().int().min(0).optional(),
      rareMax: z.number().int().min(0).optional(),
      ultraRareBps: z.number().int().min(0).max(10_000).optional(),
      maxUltraRare: z.number().int().min(0).optional(),
    })
    .default({}),
  pool: z.array(npcPoolEntrySchema).min(1),
});

export const upgradeTierSchema = z.object({
  tier: z.number().int().min(1),
  name: displayNameSchema,
  price: coinsSchema.refine((value) => value > 0n, "tier price must be positive"),
  capacityBonus: z.number().int().min(1),
  active: z.boolean().default(true),
});

export type NpcShopContent = z.input<typeof npcShopSchema>;
export type UpgradeTierContent = z.input<typeof upgradeTierSchema>;
