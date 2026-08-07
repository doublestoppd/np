import { ITEM_ICON_KEYS } from "./sourced-icons";
import { SourcedArt } from "./sourced-art";
import { TINT_INK, tintForItem } from "@/lib/content-tint";

/**
 * Item artwork.
 *
 * Two rendering paths, and which one runs is decided by whether the item
 * has a sourced silhouette:
 *
 * 1. **A silhouette**, from `public/art/items/<artKey>.svg`. These come
 *    from the game-icons.net collection under CC BY 3.0 (see
 *    docs/art-credits.md and scripts/item-icon-map.ts). They are drawn as
 *    a CSS mask rather than an `<img>` so the colour comes from the
 *    palette rather than from the file — the whole presentation still
 *    re-skins by editing tokens, which shipping 91 pre-tinted files would
 *    have quietly broken.
 * 2. **A category shape**, the original flat SVG below, for anything with
 *    no icon yet. New content is never blocked on artwork, and a missing
 *    file can never render as a solid coloured square, because the mask
 *    path is only taken for keys the build script confirmed it wrote.
 *
 * Both are placeholders and neither is the target style
 * (docs/art-direction.md): they are replaced by
 * `public/art/items/<artKey>.webp` when original painted art exists, and
 * this component stays the only thing that changes.
 */

/**
 * The colour an item is drawn in.
 *
 * Its category picks the hue and its art key picks the depth within that
 * hue, so a shelf of food is recognisably all food and still has ten
 * different objects on it. This replaced a five-entry hash over the art
 * key alone, under which a berry and a boot could be the same purple —
 * colour was present, varied, and told you nothing.
 */
function hueFor(artKey: string, categorySlug?: string) {
  const { tint, ink } = tintForItem(categorySlug, artKey);
  const shades = TINT_INK[tint];
  return { main: ink, deep: ink, soft: shades.pale };
}

interface ItemArtProps {
  artKey: string;
  categorySlug?: string;
  /** Accessible name, e.g. "Sunberry Cluster". Empty string = decorative. */
  label: string;
  className?: string;
}

export function ItemArt({ artKey, categorySlug, label, className }: ItemArtProps) {
  const hue = hueFor(artKey, categorySlug);

  if (ITEM_ICON_KEYS.has(artKey)) {
    return (
      <SourcedArt
        set="items"
        artKey={artKey}
        ink={hue.deep}
        label={label}
        className={`h-full w-full ${className ?? ""}`.trim()}
      />
    );
  }

  let shapes: React.ReactNode;
  switch (categorySlug) {
    case "food":
      shapes = (
        <>
          <ellipse cx="50" cy="66" rx="34" ry="18" fill={hue.deep} />
          <path d="M16 66a34 18 0 0 0 68 0Z" fill={hue.main} />
          <circle cx="38" cy="52" r="12" fill={hue.soft} />
          <circle cx="58" cy="48" r="13" fill={hue.main} />
          <circle cx="50" cy="60" r="11" fill={hue.soft} />
          <path
            d="M58 36q4-8 12-9"
            stroke={hue.deep}
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
      break;
    case "toys":
      shapes = (
        <>
          <circle cx="50" cy="52" r="28" fill={hue.main} />
          <path d="M22 52a28 28 0 0 1 56 0" fill={hue.soft} />
          <path
            d="M22 52h56"
            stroke={hue.deep}
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="50" cy="52" r="7" fill={hue.deep} />
        </>
      );
      break;
    case "curios":
      shapes = (
        <>
          <path d="M50 24 72 44 62 76H38L28 44Z" fill={hue.main} />
          <path d="M50 24 62 76H38Z" fill={hue.soft} />
          <path
            d="M79 30l2.2 4.8L86 37l-4.8 2.2L79 44l-2.2-4.8L72 37l4.8-2.2Z"
            fill={hue.deep}
          />
        </>
      );
      break;
    default:
      shapes = (
        <>
          <path d="M30 40h40l6 34a8 8 0 0 1-8 8H32a8 8 0 0 1-8-8Z" fill={hue.main} />
          <path d="M34 40q0-16 16-16t16 16" stroke={hue.deep} strokeWidth="4" fill="none" />
        </>
      );
  }

  return (
    <svg
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      {shapes}
    </svg>
  );
}
