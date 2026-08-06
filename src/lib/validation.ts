import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(20, "Username must be at most 20 characters.")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username may only contain letters, numbers, and underscores.",
  );

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.");

export const credentialsSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const petNameSchema = z
  .string()
  .trim()
  .min(2, "Pet name must be at least 2 characters.")
  .max(24, "Pet name must be at most 24 characters.")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9 '-]*$/,
    "Pet name may only contain letters, numbers, spaces, apostrophes, and hyphens.",
  );

export const chooseStarterSchema = z.object({
  speciesSlug: z.string().min(1, "Choose a companion."),
  petName: petNameSchema,
});

export const feedPetSchema = z.object({
  petId: z.string().min(1),
  itemId: z.string().min(1),
  // Feeding consumes an item, so it carries a key like every other
  // economic mutation (docs/conventions.md).
  idempotencyKey: z.string().min(8).max(100),
});

/** Bounds mirrored in the profile service and editor UI. */
export const BIO_MAX = 300;
export const TITLE_MAX = 60;

const NO_CONTROL_CHARS = /^[^\u0000-\u001f\u007f]*$/;
// Bio may contain newlines; all other control characters are rejected.
const BIO_ALLOWED = /^[^\u0000-\u0009\u000b-\u001f\u007f]*$/;

export const profileUpdateSchema = z.object({
  title: z
    .string()
    .trim()
    .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters.`)
    .regex(NO_CONTROL_CHARS, "Title contains unsupported characters."),
  // Browsers submit textareas with CRLF — normalize before validating.
  bio: z.preprocess(
    (value) =>
      typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value,
    z
      .string()
      .max(BIO_MAX, `Bio must be at most ${BIO_MAX} characters.`)
      .regex(BIO_ALLOWED, "Bio contains unsupported characters.")
      .transform((value) => value.trim()),
  ),
  featuredPetId: z
    .string()
    .max(64)
    .transform((value) => (value === "" ? null : value)),
});

export const showcaseItemSchema = z.object({
  itemId: z.string().min(1).max(64),
});

export const showcaseMoveSchema = z.object({
  itemId: z.string().min(1).max(64),
  direction: z.enum(["up", "down"]),
});

export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(40)
    .optional()
    .catch(undefined),
  sort: z.enum(["name", "quantity", "value"]).catch("name"),
});

// ---- Commerce ----

const idSchema = z.string().min(1).max(64);
export const idempotencyKeySchema = z.string().min(8).max(64);

export const SHOP_NAME_MAX = 40;
export const SHOP_DESCRIPTION_MAX = 200;

export const shopDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Shop name must be at least 2 characters.")
    .max(SHOP_NAME_MAX, `Shop name must be at most ${SHOP_NAME_MAX} characters.`)
    .regex(NO_CONTROL_CHARS, "Shop name contains unsupported characters."),
  description: z
    .string()
    .trim()
    .max(
      SHOP_DESCRIPTION_MAX,
      `Description must be at most ${SHOP_DESCRIPTION_MAX} characters.`,
    )
    .regex(NO_CONTROL_CHARS, "Description contains unsupported characters."),
});

export const npcPurchaseSchema = z.object({
  stockId: idSchema,
  quantity: z.coerce.number().int().min(1).max(10),
  idempotencyKey: idempotencyKeySchema,
});

export const createListingSchema = z.object({
  itemId: idSchema,
  itemInstanceId: z
    .string()
    .max(64)
    .optional()
    .transform((value) => (value ? value : null)),
  quantity: z.coerce.number().int().min(1).max(1000),
  unitPrice: z.coerce.number().int().min(1).max(1_000_000_000),
  idempotencyKey: idempotencyKeySchema,
});

export const listingPriceSchema = z.object({
  listingId: idSchema,
  unitPrice: z.coerce.number().int().min(1).max(1_000_000_000),
});

export const listingActionSchema = z.object({
  listingId: idSchema,
  idempotencyKey: idempotencyKeySchema,
  /**
   * The unit price the buyer was shown. Compared against the stored row,
   * never used as the charge — a mismatch refuses the purchase so a
   * mid-session reprice can't change the terms silently.
   */
  expectedUnitPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
});

export const claimSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
});

export const upgradeSchema = z.object({
  tier: z.coerce.number().int().min(1).max(100),
  idempotencyKey: idempotencyKeySchema,
});

/** Page sizes offered by the market's per-page control. */
export const MARKET_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_MARKET_PAGE_SIZE = 25;

export const marketSearchSchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(40)
    .optional()
    .catch(undefined),
  rarity: z
    .enum(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE"])
    .optional()
    .catch(undefined),
  // Page numbers and sizes come from the URL, so anything unparseable
  // falls back rather than erroring the page: a mangled link should still
  // render the market.
  page: z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .transform(Number)
    .catch(1),
  perPage: z
    .enum(MARKET_PAGE_SIZES.map(String) as [string, ...string[]])
    .transform(Number)
    .catch(DEFAULT_MARKET_PAGE_SIZE),
});

export const cursorSchema = z.object({
  cursor: z.string().max(64).optional().catch(undefined),
});

// ---- Daily activities ----

export const wordGuessSchema = z.object({
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  guess: z
    .string()
    .trim()
    .min(1, "Type a word first.")
    .max(12, "That's longer than any puzzle word."),
  idempotencyKey: idempotencyKeySchema,
});

export const dailySpinSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
});

export const dailyMealSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
});

// ---- Request boards ----

export const completeRequestSchema = z.object({
  boardKey: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  /**
   * The progress version the player's view was rendered from. A conflict
   * token, never an instruction: a stale value refuses the completion.
   */
  expectedStateVersion: z.coerce.number().int().min(0).max(1_000_000),
  idempotencyKey: idempotencyKeySchema,
});
