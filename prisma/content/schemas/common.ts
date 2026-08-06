import { z } from "zod";

/** Kebab-case, URL-safe stable identifier. */
export const slugSchema = z
  .string()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case a-z0-9");

/** Artwork reference key (docs/art-direction.md). */
export const artKeySchema = z.string().min(1).max(80);

/** Coin amounts are bigint end to end (src/lib/money.ts). */
export const coinsSchema = z
  .bigint()
  .nonnegative()
  .max(1_000_000_000n, "coin values above 1,000,000,000 are not supported");

export const displayNameSchema = z.string().trim().min(1).max(80);
export const descriptionSchema = z.string().trim().min(1).max(400);

export const raritySchema = z.enum(["COMMON", "UNCOMMON", "RARE", "ULTRA_RARE"]);
export const lifecycleSchema = z.enum(["DRAFT", "ACTIVE", "RETIRED", "DISABLED"]);
