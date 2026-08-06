import { z } from "zod";
import { artKeySchema, descriptionSchema, displayNameSchema, slugSchema } from "./common";

const mapCoordinate = z.number().min(0).max(100);

export const locationSchema = z.object({
  slug: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  artKey: artKeySchema,
  sortOrder: z.number().int().min(0),
  /** Explicit lifecycle: unpublished content is invisible to players. */
  published: z.boolean(),
  mapX: mapCoordinate.optional(),
  mapY: mapCoordinate.optional(),
});

export const regionSchema = z.object({
  slug: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  artKey: artKeySchema,
  sortOrder: z.number().int().min(0),
  published: z.boolean(),
  locations: z.array(locationSchema).min(1),
});

export type LocationContent = z.infer<typeof locationSchema>;
export type RegionContent = z.infer<typeof regionSchema>;
