/**
 * Which content wears which colour.
 *
 * The rule this file exists to enforce: **a tint is earned, never
 * decorative.** Every hue here answers a question a player could also read
 * in words — what is this made of, where did it come from, what kind of
 * thing is it, which region is this place in — so colour reinforces the
 * label rather than replacing it. Nothing is tinted at random, and nothing
 * is tinted by value: an expensive item and a cheap one of the same kind
 * wear the same hue, because a palette that encodes worth turns a satchel
 * into a leaderboard.
 *
 * Assignments are an explicit table rather than a hash, for the same
 * reason the icon map is: a hash gives a berry and a boot the same purple
 * and nobody can say why, which is how you end up with colour everywhere
 * and meaning nowhere.
 */

export type Tint = "berry" | "ember" | "honey" | "moss" | "tide" | "dusk";

/**
 * Every item category.
 *
 * This is the tint a player sees most, because it drives the artwork in
 * every satchel, shelf, and shop row. Chosen so they are immediately
 * separable at thumbnail size and so each fits what the category *is*:
 * food warm, playthings bright, curios cool and slightly strange,
 * furnishings earthy and grounded, books quiet, tokens metallic.
 *
 * A test pins this against the authored categories — it said "the four"
 * for a while after there were six, and twenty books and five tokens all
 * rendered in the fallback ink because a missing key here is a silent
 * default rather than an error.
 */
export const CATEGORY_TINTS: Record<string, Tint> = {
  food: "ember",
  toys: "berry",
  curios: "tide",
  furnishings: "moss",
  books: "dusk",
  tokens: "honey",
};

/**
 * Item tags, by what the tag is actually about.
 *
 * Four families, and the hue follows the family rather than the individual
 * word: materials, where a thing came from, what was done to it, and what
 * state it is in. A player never has to learn the mapping — it is simply
 * true that the watery tags are blue and the baked ones are warm — but the
 * shelf reads as sorted long before any of it is read.
 */
export const TAG_TINTS: Record<string, Tint> = {
  // Water, and everything that came out of it.
  water: "tide",
  river: "tide",
  tidal: "tide",
  glass: "tide",
  salted: "tide",

  // Growing things and the wood they grow in.
  woodland: "moss",
  foraged: "moss",
  growing: "moss",
  wood: "moss",

  // Kitchen work.
  baked: "ember",
  preserved: "ember",
  sweet: "berry",

  // Hard, made, or found things.
  stone: "honey",
  metal: "honey",
  salvaged: "honey",
  standing: "honey",

  // The two that are about how a thing is regarded rather than what it is.
  lit: "dusk",
  keepsake: "dusk",
  bound: "dusk",

  // Later additions to the families above.
  freshwater: "tide",
  brewed: "ember",
  enamelled: "honey",
};

/** Tailwind classes for a tinted badge, wash, or ink. */
export const TINT_BADGE: Record<Tint, string> = {
  berry: "bg-tint-berry-soft text-tint-berry border-tint-berry/20",
  ember: "bg-tint-ember-soft text-tint-ember border-tint-ember/20",
  honey: "bg-tint-honey-soft text-tint-honey border-tint-honey/20",
  moss: "bg-tint-moss-soft text-tint-moss border-tint-moss/20",
  tide: "bg-tint-tide-soft text-tint-tide border-tint-tide/20",
  dusk: "bg-tint-dusk-soft text-tint-dusk border-tint-dusk/20",
};

/**
 * The same six hues as plain values, for artwork.
 *
 * Raw hex, and it has to be: these are painted into SVG fills and CSS mask
 * colours where a Tailwind class cannot reach. They are the only copies of
 * the palette outside globals.css, which is why they live here beside the
 * table that assigns them rather than scattered through art components.
 */
export const TINT_INK: Record<Tint, { deep: string; mid: string; pale: string }> =
  {
    berry: { deep: "#7d2c41", mid: "#9c3a52", pale: "#c98496" },
    ember: { deep: "#7d3a1a", mid: "#9c4b22", pale: "#c98f6b" },
    honey: { deep: "#5d5210", mid: "#7a6a12", pale: "#b8ab63" },
    moss: { deep: "#2f5433", mid: "#3d6b42", pale: "#8aab86" },
    tide: { deep: "#244e5e", mid: "#2f6478", pale: "#7ba7b5" },
    dusk: { deep: "#523a68", mid: "#6a4c86", pale: "#a892bd" },
  };

/**
 * A stable shade within a category's hue.
 *
 * Category alone would make every food the same orange, which trades one
 * flat page for a slightly warmer flat page. This varies the depth — never
 * the hue — so a shelf of food is recognisably all food and still has ten
 * different objects on it.
 *
 * Only `deep` and `mid`. `pale` exists for highlights *inside* a drawn
 * shape, where something darker sits behind it; as the ink of a whole
 * silhouette it sat at under 2:1 against the artwork frame's wash, which
 * is a faded sticker rather than a picture of an object.
 */
export function tintForItem(
  categorySlug: string | null | undefined,
  artKey: string,
): { tint: Tint; ink: string } {
  const tint = (categorySlug && CATEGORY_TINTS[categorySlug]) || "honey";
  const shades = TINT_INK[tint];
  let hash = 0;
  for (const char of artKey) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return { tint, ink: hash % 2 === 0 ? shades.deep : shades.mid };
}

/** The tint for one item tag, or null when the tag has no family. */
export function tintForTag(slug: string): Tint | null {
  return TAG_TINTS[slug] ?? null;
}
