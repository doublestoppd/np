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
  {
    slug: "furnishings",
    name: "Furnishings",
    description: "Things you stand somewhere, rather than use.",
    sortOrder: 3,
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
  { slug: "freshwater", name: "Freshwater" },
  { slug: "brewed", name: "Brewed" },
  // Not the same as "foraged": foraged is picked from what grows,
  // salvaged is recovered from what somebody lost.
  { slug: "salvaged", name: "Salvaged" },
  // Furnishing facets. These describe what a thing is made of and how it
  // behaves in a picture — they are how the catalogue is browsed, and they
  // are emphatically not a set to complete.
  { slug: "standing", name: "Standing" },
  { slug: "stone", name: "Stone" },
  { slug: "wood", name: "Wood" },
  { slug: "metal", name: "Metal" },
  { slug: "glass", name: "Glass" },
  { slug: "water", name: "Water" },
  { slug: "lit", name: "Lit" },
  { slug: "growing", name: "Growing" },
] satisfies readonly ItemTagContent[];
