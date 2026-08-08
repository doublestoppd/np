/**
 * The projection from authored content onto the `Item` row.
 *
 * This exists because of a real bug: `coatCare` was added to the content
 * schema, to prisma/schema.prisma, and to the grooming domain, but not to
 * the seeder. Everything type-checked, the content validator passed, the
 * seed reported success — and every brush in the game silently became "that
 * isn't something to groom with", because the column was NULL. Nothing in
 * the stack can catch that on its own: an optional column has a legal NULL,
 * so the omission only shows up as a feature that quietly does nothing.
 */
import { describe, expect, it } from "vitest";
import { gameContent } from "../content";
import { itemSchema } from "../content/schemas/items";
import { itemScalars } from "./seed-items";

/**
 * Content keys that deliberately do NOT appear in the scalar projection,
 * each with the reason. Anything not listed here is a gameplay column and
 * must be carried across.
 */
const NOT_SCALAR: Record<string, string> = {
  slug: "the identity the upsert keys on, passed separately",
  category: "a relation, connected by slug",
  tags: "a relation, set by slug",
  furnishing: "its own table, seeded in a later pass",
};

describe("itemScalars", () => {
  it("carries every content field that isn't a relation", () => {
    const projected = Object.keys(itemScalars(gameContent.items[0]!));
    const missing = Object.keys(itemSchema.shape).filter(
      (key) => !(key in NOT_SCALAR) && !projected.includes(key),
    );
    expect(missing, "add these to itemScalars, or explain them in NOT_SCALAR").toEqual(
      [],
    );
  });

  it("does not invent columns that content has no word for", () => {
    const known = new Set(Object.keys(itemSchema.shape));
    const extra = Object.keys(itemScalars(gameContent.items[0]!)).filter(
      (key) => !known.has(key),
    );
    expect(extra).toEqual([]);
  });

  it("writes an explicit null rather than leaving an optional field absent", () => {
    // Prisma treats `undefined` as "don't touch this column" on update, so
    // clearing a field in content would otherwise never take effect.
    const plain = gameContent.items.find((item) => item.type === "BOOK")!;
    const scalars = itemScalars(plain);
    expect(scalars.hungerRestore).toBeNull();
    expect(scalars.coatCare).toBeNull();
  });

  it("carries coatCare for grooming tools", () => {
    const tools = gameContent.items.filter(
      (item) => item.type === "GROOMING_TOOL",
    );
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(itemScalars(tool).coatCare, tool.slug).toBeGreaterThan(0);
    }
  });
});
