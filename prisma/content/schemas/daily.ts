import { z } from "zod";
import { coinsSchema, displayNameSchema, slugSchema } from "./common";

/**
 * Daily word answers: ordered rotation lists, one per difficulty. The
 * array index IS the sequence position — append only; inserting or
 * reordering renumbers everything after the edit and is only acceptable
 * during pre-alpha together with a full database reset
 * (prisma/content/README.md).
 */
const wordShape = z
  .string()
  .regex(/^[A-Z]+$/, "answers are uppercase A-Z only");

export const wordAnswerEntrySchema = z.union([
  wordShape,
  z.object({ word: wordShape, active: z.boolean() }),
]);

/**
 * Every difficulty launches with at least 100 configured answers (a
 * minimum, not an exact count, so future words can be appended). The
 * active-count floor is enforced separately in prisma/seed/validation.ts
 * so deactivations must be paired with appended replacements.
 */
export const WORD_MIN_CONFIGURED_ANSWERS = 100;

export const wordAnswersSchema = z.object({
  EASY: z.array(wordAnswerEntrySchema).min(WORD_MIN_CONFIGURED_ANSWERS),
  MEDIUM: z.array(wordAnswerEntrySchema).min(WORD_MIN_CONFIGURED_ANSWERS),
  HARD: z.array(wordAnswerEntrySchema).min(WORD_MIN_CONFIGURED_ANSWERS),
});

export const wheelPoolSchema = z.object({
  slug: slugSchema,
  entries: z
    .array(
      z.object({
        itemSlug: slugSchema,
        weight: z.number().int().min(1).max(100_000),
        minimumQuantity: z.number().int().min(1).default(1),
        maximumQuantity: z.number().int().min(1).default(1),
        active: z.boolean().default(true),
      }),
    )
    .min(1),
});

export const wheelPrizeSchema = z.object({
  label: displayNameSchema,
  icon: z.string().min(1).max(8),
  resultType: z.enum(["COINS", "ITEM_POOL", "NOTHING"]),
  /** Basis points; active prize weights must sum to exactly 10000. */
  weight: z.number().int().min(1).max(10_000),
  coinAmount: coinsSchema.optional(),
  poolSlug: slugSchema.optional(),
  displayOrder: z.number().int().min(0),
  flavorText: z.string().default(""),
  active: z.boolean().default(true),
});

export const wheelSchema = z.object({
  slug: slugSchema,
  name: displayNameSchema,
  pools: z.array(wheelPoolSchema),
  /**
   * IMMUTABLE_VERSIONED: once any spin references a version, its prizes
   * may never change — author a new version instead.
   */
  configuration: z.object({
    version: z.number().int().min(1),
    prizes: z.array(wheelPrizeSchema).min(1),
  }),
});

export const mealPoolSchema = z.object({
  slug: slugSchema,
  entries: z
    .array(
      z.object({
        itemSlug: slugSchema,
        weight: z.number().int().min(1).max(100_000),
        quantity: z.number().int().min(1).default(1),
        active: z.boolean().default(true),
      }),
    )
    .min(1),
});

export const dailyContentSchema = z.object({
  wordAnswers: wordAnswersSchema,
  wheel: wheelSchema,
  meal: mealPoolSchema,
});

export type WordAnswerEntry = z.input<typeof wordAnswerEntrySchema>;
export type WordAnswersContent = z.input<typeof wordAnswersSchema>;
export type WheelContent = z.input<typeof wheelSchema>;
export type MealPoolContent = z.input<typeof mealPoolSchema>;
