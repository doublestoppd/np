import { describe, expect, it } from "vitest";
import {
  BIO_MAX,
  inventoryQuerySchema,
  profileUpdateSchema,
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
