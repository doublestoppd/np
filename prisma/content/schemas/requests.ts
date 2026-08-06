import { z } from "zod";
import { coinsSchema, descriptionSchema, displayNameSchema, slugSchema } from "./common";

/**
 * Request boards: an ordered, authored list of item-delivery requests
 * posted at a location. Players work through them independently; there is
 * no expiry, no branching, and no procedural generation.
 */
export const requestRequirementSchema = z.object({
  itemSlug: slugSchema,
  quantity: z.number().int().min(1).max(99),
});

export const requestDefinitionSchema = z.object({
  slug: slugSchema,
  /** Authored rotation order; contiguous from 0 within a board. */
  sequencePosition: z.number().int().min(0),
  title: displayNameSchema,
  flavorText: z.string().trim().max(400).default(""),
  requirements: z.array(requestRequirementSchema).min(1).max(3),
  rewardCoins: coinsSchema,
  active: z.boolean().default(true),
});

export const requestBoardSchema = z.object({
  key: slugSchema,
  name: displayNameSchema,
  description: descriptionSchema,
  active: z.boolean().default(true),
  /** Completions allowed per player per UTC game day. */
  dailyCompletionLimit: z.number().int().min(1).max(50),
  requests: z.array(requestDefinitionSchema).min(1),
});

export type RequestRequirementContent = z.input<typeof requestRequirementSchema>;
export type RequestDefinitionContent = z.input<typeof requestDefinitionSchema>;
export type RequestBoardContent = z.input<typeof requestBoardSchema>;
