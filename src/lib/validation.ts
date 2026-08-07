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

export const playWithPetSchema = z.object({
  petId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
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
  /**
   * The specific copy being displayed, for non-stackable definitions.
   * Bounded like every other id: it reaches a `findUnique`, and an
   * unbounded string has no business getting that far.
   */
  itemInstanceId: z
    .string()
    .max(64)
    .optional()
    .transform((value) => (value ? value : null)),
});

export const showcaseMoveSchema = z.object({
  itemId: z.string().min(1).max(64),
  direction: z.enum(["up", "down"]),
});

/**
 * The one declaration of how a satchel can be sorted. It lives here, the
 * client-safe module, because the schema and the query layer both need it
 * and only one of them may reach server code.
 */
export const INVENTORY_SORTS = ["name", "quantity", "value"] as const;
export type InventorySort = (typeof INVENTORY_SORTS)[number];

export const inventoryQuerySchema = z.object({
  q: z.string().trim().max(60).optional().catch(undefined),
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(40)
    .optional()
    .catch(undefined),
  sort: z.enum(INVENTORY_SORTS).catch("name"),
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
  // Repricing changes the terms of escrowed goods and writes a ledger
  // row, so it carries a key like every other economic mutation.
  idempotencyKey: idempotencyKeySchema,
});

export const listingActionSchema = z.object({
  listingId: idSchema,
  /**
   * How many units to take. A listing of five is five things for sale, so
   * a buyer picks a number; absent means one, which is what the direct
   * Buy button on a single-unit listing submits.
   */
  quantity: z.coerce.number().int().min(1).max(1000).catch(1),
  idempotencyKey: idempotencyKeySchema,
  /**
   * The unit price the buyer was shown. Compared against the stored row,
   * never used as the charge — a mismatch refuses the purchase so a
   * mid-session reprice can't change the terms silently.
   */
  expectedUnitPrice: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
});

/** Cancelling names a listing and nothing else. */
export const cancelListingSchema = z.object({
  listingId: idSchema,
  idempotencyKey: idempotencyKeySchema,
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

/**
 * A client-requested random-event roll. Both fields are hints the server
 * re-checks: the route is validated against the allow-list in
 * `modules/events/routes.ts`, and the key only scopes idempotent replay.
 */
export const randomEventRollSchema = z.object({
  routePath: z.string().min(1).max(512),
  idempotencyKey: idempotencyKeySchema,
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

// ---- Foraging ----

export const searchSpotSchema = z.object({
  spotSlug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  idempotencyKey: idempotencyKeySchema,
});

/**
 * A look for the lantern. The client names a place and nothing else — it
 * cannot say whether it found anything, which look this is, or what that
 * would pay.
 */
export const lanternLookSchema = z.object({
  locationId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
});

/**
 * Scratching a chit. The client names the card and nothing else — which
 * outcome, what it pays, and whether they even have one are all server
 * decisions.
 */
export const scratchCardSchema = z.object({
  itemId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
});

// ---- Sorting Bench ----

/**
 * A batch of placements. The client's ENTIRE vocabulary: which run, which
 * finds it believes it is placing, and which shelves. No board, no score,
 * no outcome — those are derived server-side from the seed it never sees.
 */
export const sortingBatchSchema = z.object({
  runId: idSchema,
  fromDrawIndex: z.coerce.number().int().min(0).max(60),
  /**
   * One shelf index per placement, e.g. "3102". Four shelves, so digits
   * are 0-3 (SHELF_COUNT). The domain rejects an out-of-range shelf before
   * the transaction regardless, but the schema should not admit a shelf
   * that does not exist.
   */
  moves: z
    .string()
    .min(1)
    .max(5)
    .regex(/^[0-3]+$/),
});

// ---- Request boards ----

/** Skipping submits the same board key and conflict token as completing. */
export const skipRequestSchema = z.object({
  boardKey: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  expectedStateVersion: z.coerce.number().int().min(0).max(1_000_000),
  idempotencyKey: idempotencyKeySchema,
});

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

// ---- The Hollow ----

const CONTENT_KEY = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

/** A row id the server will look up; bounded like every other id. */
const ROW_ID = z.string().min(1).max(64);

/**
 * Longest caption a player may write under one of their grounds. Declared
 * here rather than in the domain module because both this schema and the
 * command need it, and only one of them may reach server code — a copied
 * bound enforces nothing and drifts (docs/conventions.md).
 */
export const HOLLOW_CAPTION_MAX = 120;

export const hollowPurchaseFurnishingSchema = z.object({
  slug: CONTENT_KEY,
  /**
   * Buying the same object again is the point, so quantity is a real
   * field — bounded only so one submission cannot ask for a fortune's
   * worth by accident.
   */
  quantity: z.coerce.number().int().min(1).max(10),
  idempotencyKey: idempotencyKeySchema,
});

export const hollowPurchaseGroundSchema = z.object({
  groundKey: CONTENT_KEY,
  idempotencyKey: idempotencyKeySchema,
});

export const hollowPurchaseAirSchema = z.object({
  airKey: CONTENT_KEY,
  idempotencyKey: idempotencyKeySchema,
});

export const hollowPlaceSchema = z.object({
  sceneId: ROW_ID,
  anchorKey: CONTENT_KEY,
  slug: CONTENT_KEY,
});

export const hollowAnchorSchema = z.object({
  sceneId: ROW_ID,
  anchorKey: CONTENT_KEY,
});

export const hollowMoveSchema = z.object({
  fromSceneId: ROW_ID,
  fromAnchorKey: CONTENT_KEY,
  toSceneId: ROW_ID,
  toAnchorKey: CONTENT_KEY,
});

export const hollowSetAirSchema = z.object({
  sceneId: ROW_ID,
  airKey: CONTENT_KEY,
});

/** Captions are plain text, like the bio, and never markup. */
export const hollowCaptionSchema = z.object({
  sceneId: ROW_ID,
  caption: z
    .string()
    .max(
      HOLLOW_CAPTION_MAX,
      `Captions must be at most ${HOLLOW_CAPTION_MAX} characters.`,
    )
    .regex(NO_CONTROL_CHARS, "That caption contains unsupported characters.")
    .transform((value) => value.trim()),
});

export const hollowMoveSceneSchema = z.object({
  sceneId: ROW_ID,
  direction: z.enum(["up", "down"]),
});

// ---- The Leaving Shelf ----

/**
 * Most copies one lot may hold. Declared here rather than in the domain
 * module for the same reason the caption bound is: both this schema and
 * the command need it, only one of them may reach server code, and a
 * copied bound enforces nothing and drifts (docs/conventions.md).
 *
 * Five, because a lot is a handful of spares rather than a delivery — and
 * because only one copy per lot goes to any one player, so five is five
 * different people rather than five for the fastest.
 */
export const GIVEAWAY_MAX_QUANTITY = 5;

export const giveawayLeaveSchema = z.object({
  itemId: ROW_ID,
  quantity: z.coerce.number().int().min(1).max(GIVEAWAY_MAX_QUANTITY),
  idempotencyKey: idempotencyKeySchema,
});

/**
 * Taking submits which lot and nothing else. There is no quantity field
 * anywhere in the take path: one copy per lot per player is a rule, not a
 * default, so the client has no number to send and none to be trusted on.
 */
export const giveawayTakeSchema = z.object({
  offeringId: ROW_ID,
  idempotencyKey: idempotencyKeySchema,
});
