import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BIO_MAX,
  feedPetSchema,
  idempotencyKeySchema,
  inventoryQuerySchema,
  playWithPetSchema,
  profileUpdateSchema,
  readToPetSchema,
  TITLE_MAX,
} from "./validation";

describe("profileUpdateSchema", () => {
  const valid = {
    title: "Keeper of Small Things",
    bio: "First line.\nSecond line.",
    featuredPetId: "",
  };

  it("accepts valid input and normalizes empty featuredPetId to null", () => {
    const parsed = profileUpdateSchema.parse(valid);
    expect(parsed.title).toBe("Keeper of Small Things");
    expect(parsed.bio).toBe("First line.\nSecond line.");
    expect(parsed.featuredPetId).toBeNull();
  });

  it("normalizes CRLF newlines in the bio", () => {
    const parsed = profileUpdateSchema.parse({
      ...valid,
      bio: "One.\r\nTwo.",
    });
    expect(parsed.bio).toBe("One.\nTwo.");
  });

  it("rejects a bio over the length limit", () => {
    const result = profileUpdateSchema.safeParse({
      ...valid,
      bio: "x".repeat(BIO_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a title over the length limit", () => {
    const result = profileUpdateSchema.safeParse({
      ...valid,
      title: "x".repeat(TITLE_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects control characters in the title", () => {
    const result = profileUpdateSchema.safeParse({
      ...valid,
      title: "sneaky\u0007title",
    });
    expect(result.success).toBe(false);
  });

  it("rejects newlines in the title", () => {
    const result = profileUpdateSchema.safeParse({
      ...valid,
      title: "two\nlines",
    });
    expect(result.success).toBe(false);
  });

  it("rejects control characters (other than newline) in the bio", () => {
    const result = profileUpdateSchema.safeParse({
      ...valid,
      bio: "null\u0000byte",
    });
    expect(result.success).toBe(false);
  });

  it("keeps markup as inert plain text rather than rejecting it", () => {
    // Rendering escapes it; validation only needs to keep it in-bounds.
    const parsed = profileUpdateSchema.parse({
      ...valid,
      bio: "<script>alert('hi')</script>",
    });
    expect(parsed.bio).toBe("<script>alert('hi')</script>");
  });
});

describe("inventoryQuerySchema", () => {
  it("applies defaults for missing values", () => {
    const parsed = inventoryQuerySchema.parse({ sort: undefined });
    expect(parsed.sort).toBe("name");
    expect(parsed.q).toBeUndefined();
    expect(parsed.category).toBeUndefined();
  });

  it("falls back safely on invalid sort and category values", () => {
    const parsed = inventoryQuerySchema.parse({
      sort: "backwards",
      category: "NOT A SLUG!!",
      q: "berries",
    });
    expect(parsed.sort).toBe("name");
    expect(parsed.category).toBeUndefined();
    expect(parsed.q).toBe("berries");
  });
});

/**
 * One bound for an idempotency key, not two.
 *
 * This file used to declare `.min(8).max(64)` for every economic mutation
 * and a hand-rolled `.min(8).max(100)` for the three pet-care ones — under
 * a comment claiming they followed the same rule as every other economic
 * mutation. Nothing exploited it (the field is a 36-character UUID and the
 * column is unbounded), but two answers to one question is how the next
 * schema gets written wrong.
 */
describe("the idempotency key bound", () => {
  const carriers = [
    ["feedPetSchema", feedPetSchema],
    ["readToPetSchema", readToPetSchema],
    ["playWithPetSchema", playWithPetSchema],
  ] as const;

  it.each(carriers)("%s accepts a key the canonical schema accepts", (_name, schema) => {
    const key = "a".repeat(64);
    expect(idempotencyKeySchema.safeParse(key).success).toBe(true);
    expect(
      schema.safeParse({
        petId: "p1",
        itemId: "i1",
        idempotencyKey: key,
      }).success,
    ).toBe(true);
  });

  it.each(carriers)("%s rejects a key the canonical schema rejects", (_name, schema) => {
    const key = "a".repeat(65);
    expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
    expect(
      schema.safeParse({
        petId: "p1",
        itemId: "i1",
        idempotencyKey: key,
      }).success,
    ).toBe(false);
  });

  it("is the only bound stated in this file", () => {
    // A second `.min(8).max(N)` is a second answer. The one match allowed
    // is the canonical declaration itself.
    //
    // Comments are stripped first: the declaration's own note quotes the
    // bound it replaced, and a scan that counted prose would fail on the
    // explanation of why it exists.
    const code = readFileSync(join(process.cwd(), "src/lib/validation.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const declarations = code.match(/\.min\(8\)\.max\(\d+\)/g) ?? [];
    expect(declarations).toEqual([".min(8).max(64)"]);
  });
});
