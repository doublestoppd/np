/**
 * Placeholder item artwork: simple original flat shapes chosen by category,
 * tinted deterministically from the artKey so items stay distinguishable.
 * Replaced later by `public/art/items/<artKey>.webp` (docs/art-direction.md).
 */

const HUES = [
  { main: "#b98a3c", soft: "#e8d9b8", deep: "#8a6526" },
  { main: "#7d9a52", soft: "#dde7c8", deep: "#5a7338" },
  { main: "#a95f4f", soft: "#ecd3c8", deep: "#7e4237" },
  { main: "#5f7fa8", soft: "#d3ddec", deep: "#43608a" },
  { main: "#8a6ba0", soft: "#e0d5ea", deep: "#674e7c" },
] as const;

function hueFor(artKey: string) {
  let hash = 0;
  for (const char of artKey) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return HUES[hash % HUES.length] ?? HUES[0];
}

interface ItemArtProps {
  artKey: string;
  categorySlug?: string;
  /** Accessible name, e.g. "Sunberry Cluster". Empty string = decorative. */
  label: string;
  className?: string;
}

export function ItemArt({ artKey, categorySlug, label, className }: ItemArtProps) {
  const hue = hueFor(artKey);
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
