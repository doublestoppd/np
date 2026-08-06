import { z } from "zod";
import { artKeySchema, descriptionSchema, displayNameSchema, slugSchema } from "./common";

const mapCoordinate = z.number().min(0).max(100);

/**
 * The finite set of things a player can do at a location. Mirrors the
 * Prisma LocationActivityType enum; adding a value here means adding a
 * real activity domain, not a config flag.
 */
export const locationActivityTypeSchema = z.enum([
  "NPC_SHOP",
  "DAILY_WORD",
  "DAILY_WHEEL",
  "DAILY_MEAL",
  "REQUEST_BOARD",
]);

/**
 * An activity attachment: what is available here, in what order. The
 * configuration itself lives in the owning domain's content file and is
 * referenced by `activityKey` — never duplicated under the location.
 */
export const locationActivitySchema = z.object({
  type: locationActivityTypeSchema,
  activityKey: slugSchema,
  displayOrder: z.number().int().min(0),
  active: z.boolean().default(true),
});

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
  activities: z.array(locationActivitySchema).default([]),
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

export type LocationActivityType = z.infer<typeof locationActivityTypeSchema>;
export type LocationActivityContent = z.input<typeof locationActivitySchema>;
export type LocationContent = z.input<typeof locationSchema>;
export type RegionContent = z.input<typeof regionSchema>;
