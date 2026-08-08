import { z } from "zod";
import type { ArcadeGame } from "@prisma/client";

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

/**
 * The one bound for an idempotency key, declared before its first use.
 *
 * There used to be two, ninety lines apart in this file: this one, and a
 * hand-rolled `.min(8).max(100)` in the three pet-care schemas — which
 * carried a comment saying they follow the same rule as every other
 * economic mutation while using a different bound from every one of them.
 * Not exploitable (the field is minted as a 36-character UUID and the
 * column is unbounded), but two answers to one question is how the next
 * schema gets written wrong.
 */
export const idempotencyKeySchema = z.string().min(8).max(64);

export const feedPetSchema = z.object({
  petId: z.string().min(1),
  itemId: z.string().min(1),
  // Feeding consumes an item, so it carries a key like every other
  // economic mutation (docs/conventions.md) — including the same bound.
  idempotencyKey: idempotencyKeySchema,
});

/**
 * Reading a book aloud. Consumes the book, so it carries a key like every
 * other economic mutation.
 */
export const readToPetSchema = z.object({
  petId: z.string().min(1),
  itemId: z.string().min(1),
  idempotencyKey: idempotencyKeySchema,
});

/**
 * Giving a remedy, and brushing. Same shape as the other care verbs — the
 * client names a companion, a thing it owns, and a key. What the remedy
 * treats and what the brush is worth are read from the server's own rows.
 */
export const treatPetSchema = z.object({
  petId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
});

export const groomPetSchema = z.object({
  petId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
});

/**
 * The arcade games (ADR-62).
 *
 * The submission carries a run id, a trace and an idempotency key — and
 * deliberately NO score. There is no field here for one, so there is
 * nothing to validate a claimed score against and no "reasonable maximum"
 * to argue about: the server replays the trace and works it out.
 *
 * The trace's own bounds (fixed-width hex, event count, ordering, minimum
 * spacing) are checked by `decodeTrace`, because they are rules about the
 * game rather than about the request. This only has to keep an absurd
 * payload out of the database.
 */
/**
 * Every arcade game, kept exhaustive by the compiler.
 *
 * This was a hand-typed `z.enum(["PAPER_BIRD", "TREE_CLIMB"])`, and adding
 * a third game left it behind: the schema, the registry, the seed and the
 * simulation were all correct, and every attempt to start a run came back
 * "Invalid request." from the one list nothing checked. Written as a record
 * over the Prisma enum instead, a missing game is a compile error.
 *
 * The import is type-only on purpose. This module is imported by client
 * components, and a runtime `@prisma/client` import would drag the query
 * engine's types into the browser bundle; a type-only one is erased.
 */
const ARCADE_GAMES = {
  PAPER_BIRD: true,
  TREE_CLIMB: true,
  SNAKE: true,
} satisfies Record<ArcadeGame, true>;

export const arcadeStartSchema = z.object({
  game: z.enum(Object.keys(ARCADE_GAMES) as [ArcadeGame, ...ArcadeGame[]]),
});

export const arcadeSubmitSchema = z.object({
  runId: z.string().min(1).max(64),
  /** 5 hex characters per event; MAX_EVENTS is 4000. */
  trace: z
    .string()
    .max(20_000)
    .regex(/^[0-9a-f]*$/, "malformed"),
  idempotencyKey: idempotencyKeySchema,
});

/** Sitting with them takes no item — there is nothing to name (ADR-61). */
export const sitWithPetSchema = z.object({
  petId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
});

export const takeKeepsakeSchema = z.object({
  petId: z.string().min(1).max(64),
  keepsakeId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
});

export const playWithPetSchema = z.object({
  petId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
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

/** Forum bounds, mirrored by CHECK constraints in the migration. */
export const THREAD_TITLE_MIN = 3;
export const THREAD_TITLE_MAX = 120;
export const POST_BODY_MAX = 8000;

/**
 * Post and thread text.
 *
 * Newlines are the point of a forum post, so the body allows them and
 * rejects every other control character — the same split the bio makes,
 * for the same reason. Browsers submit textareas with CRLF, so it is
 * normalised before anything measures it: otherwise the character count
 * a player sees and the one the server enforces disagree by one per line.
 *
 * The trim happens AFTER the maximum is checked, so 8000 characters of
 * text plus trailing whitespace is not silently accepted as something
 * longer than the limit.
 */
const postBodySchema = z.preprocess(
  (value) =>
    typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value,
  z
    .string()
    .max(POST_BODY_MAX, `A post must be at most ${POST_BODY_MAX} characters.`)
    .regex(BIO_ALLOWED, "That post contains unsupported characters.")
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, "A post needs something in it."),
);

export const createThreadSchema = z.object({
  boardSlug: z.string().min(1).max(64),
  title: z
    .string()
    .trim()
    .min(
      THREAD_TITLE_MIN,
      `A title needs at least ${THREAD_TITLE_MIN} characters.`,
    )
    .max(
      THREAD_TITLE_MAX,
      `A title must be at most ${THREAD_TITLE_MAX} characters.`,
    )
    .regex(NO_CONTROL_CHARS, "That title contains unsupported characters."),
  body: postBodySchema,
  idempotencyKey: idempotencyKeySchema,
});

export const createPostSchema = z.object({
  threadId: z.string().min(1).max(64),
  body: postBodySchema,
  idempotencyKey: idempotencyKeySchema,
});

export const editPostSchema = z.object({
  postId: z.string().min(1).max(64),
  body: postBodySchema,
});

export const withdrawPostSchema = z.object({
  postId: z.string().min(1).max(64),
});

export const reportPostSchema = z.object({
  postId: z.string().min(1).max(64),
  /**
   * Optional on purpose. "This is wrong" with no explanation is still
   * worth knowing, and a required field is one more reason not to bother
   * reporting something that should be reported.
   */
  reason: z.preprocess(
    (value) =>
      typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value,
    z
      .string()
      .max(1000, "Keep it under 1000 characters.")
      .regex(BIO_ALLOWED, "That contains unsupported characters.")
      .transform((value) => value.trim()),
  ),
});

/**
 * Every moderator action, as a closed list.
 *
 * An unknown intent is a parse failure rather than a switch that quietly
 * does nothing — which is what would happen if this were a bare string
 * and somebody renamed a case.
 */
export const MODERATION_INTENTS = [
  "remove-post",
  "restore-post",
  "lock-thread",
  "unlock-thread",
  "pin-thread",
  "unpin-thread",
  "dismiss-report",
] as const;

export const moderateSchema = z.object({
  intent: z.enum(MODERATION_INTENTS),
  subjectId: z.string().min(1).max(64),
  reason: z
    .string()
    .max(1000, "Keep it under 1000 characters.")
    .regex(BIO_ALLOWED, "That contains unsupported characters.")
    .transform((value) => value.trim()),
});

export const SHOP_NAME_MAX = 40;
export const SHOP_DESCRIPTION_MAX = 200;

export const shopDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Shop name must be at least 2 characters.")
    .max(
      SHOP_NAME_MAX,
      `Shop name must be at most ${SHOP_NAME_MAX} characters.`,
    )
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
  expectedUnitPrice: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000_000)
    .optional(),
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

/**
 * Working the drums. The client names the token and nothing else — which
 * outcome, what it pays, and whether they even have one are all server
 * decisions.
 */
export const slotSpinSchema = z.object({
  itemId: z.string().min(1).max(64),
  idempotencyKey: idempotencyKeySchema,
});

/**
 * The matching game. A flip names a run and a card index; there is no
 * field here for a face, a match, or a score, because the server derives
 * all three from a seed the client never sees.
 */
export const matchingStartSchema = z.object({
  difficulty: z.enum(["GENTLE", "BRISK", "DEEP"]),
});

export const matchingFlipSchema = z.object({
  runId: z.string().min(1).max(64),
  /** Bounded by the largest board; the replay re-checks it anyway. */
  card: z.coerce.number().int().min(0).max(63),
});

// ---- Admin debug ----

/**
 * Which player, and how much to clear. The scope is a closed set rather
 * than a free string: "today" rewinds paid activities and is the one that
 * touches the economy.
 */
export const adminResetSchema = z.object({
  username: z.string().trim().min(1).max(64),
  scope: z.enum(["throttles", "today"]),
});

/**
 * A debug coin grant.
 *
 * Bounded by MAX_MONEY_INPUT like every other money field — not as a
 * gameplay limit but because a bigint wallet built from an unbounded
 * number is how a display, a sum, or a reconciliation total goes wrong.
 * The minimum is 1: a grant of zero writes a ledger row that says nothing
 * happened, and a negative is a debit, which this is deliberately not
 * (see the action).
 */
export const adminGrantCoinsSchema = z.object({
  username: z.string().trim().min(1).max(64),
  amount: z.coerce.number().int().min(1).max(1_000_000_000),
});

// ---- The Sunken Stair ----

/**
 * One step of a descent.
 *
 * The client's entire vocabulary: which door, and which room it thinks it
 * is standing in. The depth is a GUARD rather than an instruction — the
 * server refuses anything that is not the room it has the player in, so a
 * second tab or a double submit cannot advance a descent nobody is
 * looking at.
 */
export const caveChoiceSchema = z.object({
  depth: z.coerce.number().int().min(1).max(10),
  door: z.coerce.number().int().min(0).max(1),
  idempotencyKey: idempotencyKeySchema,
});

// ---- The Morning Slate ----

/**
 * The client's ENTIRE vocabulary for the slate: 81 characters. No cell
 * index, no "I am done", no score. The server re-imposes the givens over
 * whatever arrives and decides for itself whether the grid is finished
 * and whether it is right.
 */
export const sudokuGridSchema = z.object({
  entries: z.string().regex(/^[1-9.]{81}$/, "That isn't a grid."),
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
