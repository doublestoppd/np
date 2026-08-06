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
