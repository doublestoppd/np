import { tintForTag } from "@/lib/content-tint";
import { Badge } from "./badge";

/**
 * One item tag, wearing its family's colour.
 *
 * Tags are the densest content signal the game has — most items carry two
 * or three, and they sit on every card in every satchel, shop and market
 * row — and until now every one of them was the same grey pill. Colouring
 * them by family is what turns a shelf from a list into something you can
 * skim: the watery things are blue, the growing things green, the baked
 * things warm.
 *
 * The name is always shown. An unfamiliar tag falls back to neutral rather
 * than borrowing a hue it has not earned (see `TAG_TINTS`).
 */
export function TagBadge({ slug, name }: { slug: string; name: string }) {
  const tint = tintForTag(slug);
  return tint ? <Badge tint={tint}>{name}</Badge> : <Badge>{name}</Badge>;
}
