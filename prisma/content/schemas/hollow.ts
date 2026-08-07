import { z } from "zod";
import {
  artKeySchema,
  coinsSchema,
  descriptionSchema,
  displayNameSchema,
  slugSchema,
} from "./common";

/**
 * The Hollow: painted grounds, the airs that light them, and the anchors
 * furnishings stand at. Furnishings themselves are ordinary items (see
 * ./items.ts) carrying a `furnishing` block.
 *
 * Nothing here is generic config for a scripting engine. An anchor says
 * *where* something stands and *how big* a thing fits; it never carries
 * rules, effects, or behaviour (docs/content-model.md).
 */

export const furnishingSizeSchema = z.enum([
  "SMALL",
  "MEDIUM",
  "LARGE",
  "CENTREPIECE",
]);

/**
 * Furnishing-specific item data. `size` is a rendering contract, never a
 * rank; `growthDays` starts a clock that only real time advances.
 */
export const furnishingSchema = z.object({
  size: furnishingSizeSchema,
  growthDays: z.number().int().min(1).max(400).optional(),
});

const percentSchema = z.number().min(0).max(100);

/**
 * One authored standing place in a ground. Position is a percentage of the
 * frame so the picture composes identically at every viewport; `depth`
 * orders overlap back-to-front and doubles as the reading order for the
 * composed description a screen reader hears.
 */
export const hollowAnchorSchema = z.object({
  key: slugSchema,
  /** How a person would refer to the spot: "the near bank". */
  label: displayNameSchema,
  /** Largest furnishing this place can hold. Smaller ones also fit. */
  maxSize: furnishingSizeSchema,
  x: percentSchema,
  y: percentSchema,
  /** Back (0) to front. Unique within a ground. */
  depth: z.number().int().min(0).max(20),
});

export const hollowGroundSchema = z
  .object({
    key: slugSchema,
    name: displayNameSchema,
    description: descriptionSchema,
    artKey: artKeySchema,
    anchors: z.array(hollowAnchorSchema).length(8),
  })
  .superRefine((ground, ctx) => {
    const keys = new Set<string>();
    const depths = new Set<number>();
    let centres = 0;
    for (const anchor of ground.anchors) {
      if (keys.has(anchor.key)) {
        ctx.addIssue({
          code: "custom",
          message: `ground "${ground.key}": duplicate anchor key "${anchor.key}"`,
        });
      }
      keys.add(anchor.key);
      if (depths.has(anchor.depth)) {
        ctx.addIssue({
          code: "custom",
          message: `ground "${ground.key}": two anchors share depth ${anchor.depth}`,
        });
      }
      depths.add(anchor.depth);
      if (anchor.maxSize === "CENTREPIECE") {
        centres += 1;
      }
    }
    // Exactly one centre per ground is what makes owning a second
    // centrepiece a statement rather than a duplicate.
    if (centres !== 1) {
      ctx.addIssue({
        code: "custom",
        message: `ground "${ground.key}": needs exactly one CENTREPIECE anchor, found ${centres}`,
      });
    }
  });

/**
 * A ground's price is set by how many you already hold, not by which one
 * you pick — so the choice of picture is never a choice of price.
 * `order` 0 is the ground every Hollow opens with, and it is free.
 */
export const hollowGroundPriceSchema = z.object({
  order: z.number().int().min(0),
  price: coinsSchema,
});

/**
 * An air is account-wide and free to switch once held, so buying one
 * repaints every ground and re-values every furnishing already owned.
 */
export const hollowAirSchema = z.object({
  key: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  /** Zero for the air every Hollow opens with. */
  price: coinsSchema,
  /** Display order in the catalogue; not a rank. */
  sortOrder: z.number().int().min(0),
});

export type FurnishingContent = z.infer<typeof furnishingSchema>;
export type HollowAnchorContent = z.infer<typeof hollowAnchorSchema>;
export type HollowGroundContent = z.input<typeof hollowGroundSchema>;
export type HollowGroundPriceContent = z.infer<typeof hollowGroundPriceSchema>;
export type HollowAirContent = z.infer<typeof hollowAirSchema>;
