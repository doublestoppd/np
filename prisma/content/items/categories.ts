import type { ItemCategoryContent, ItemTagContent } from "../schemas";

/**
 * Display categories (never prescriptive — a collection is whatever the
 * player decides it is; docs/design-philosophy.md).
 */
export const itemCategories = [
  {
    slug: "food",
    name: "Food",
    description: "Things that are, at least in principle, edible.",
    sortOrder: 0,
  },
  {
    slug: "toys",
    name: "Toys",
    description: "Things that exist to be chased, squeaked, or stacked.",
    sortOrder: 1,
  },
  {
    slug: "curios",
    name: "Curios",
    description: "Things whose entire job is to be kept.",
    sortOrder: 2,
  },
] satisfies readonly ItemCategoryContent[];

/** Descriptive tags; they describe content, never prescribe collecting. */
export const itemTags = [
  { slug: "sweet", name: "Sweet" },
  { slug: "baked", name: "Baked" },
  { slug: "foraged", name: "Foraged" },
  { slug: "river", name: "River" },
  { slug: "woodland", name: "Woodland" },
  { slug: "keepsake", name: "Keepsake" },
  { slug: "salted", name: "Salted" },
  { slug: "preserved", name: "Preserved" },
  { slug: "tidal", name: "Tidal" },
  // Not the same as "foraged": foraged is picked from what grows,
  // salvaged is recovered from what somebody lost.
  { slug: "salvaged", name: "Salvaged" },
] satisfies readonly ItemTagContent[];
