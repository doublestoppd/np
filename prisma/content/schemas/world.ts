import { z } from "zod";
import { LocationActivityType as PrismaLocationActivityType } from "@prisma/client";
import { artKeySchema, descriptionSchema, displayNameSchema, slugSchema } from "./common";

const mapCoordinate = z.number().min(0).max(100);

/**
 * The finite set of things a player can do at a location. Derived from the
 * Prisma enum rather than restated, so the two cannot drift: a hand-copied
 * list would let a new activity type pass the compile-time renderer guard
 * and then fail at seed time with a validation error.
 *
 * Adding a value means adding a real activity domain, not a config flag.
 */
export const locationActivityTypeSchema = z.enum(PrismaLocationActivityType);

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

/** Re-exported so content files name the same type the database does. */
export type { PrismaLocationActivityType as LocationActivityType };
export type LocationActivityContent = z.input<typeof locationActivitySchema>;
export type LocationContent = z.input<typeof locationSchema>;
export type RegionContent = z.input<typeof regionSchema>;
