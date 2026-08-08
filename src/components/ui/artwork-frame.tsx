export type ArtworkAspect = "square" | "wide" | "portrait";
export type ArtworkFocal = "center" | "top" | "bottom";

const ASPECTS: Record<ArtworkAspect, string> = {
  square: "aspect-square",
  wide: "aspect-video",
  portrait: "aspect-4/5",
};

const FOCALS: Record<ArtworkFocal, string> = {
  center: "[&_img]:object-center",
  top: "[&_img]:object-top",
  bottom: "[&_img]:object-bottom",
};

interface ArtworkFrameProps {
  children?: React.ReactNode;
  aspect?: ArtworkAspect;
  /**
   * Focal position for cropped raster art (object-position). Placeholder
   * SVGs scale to fit, so this only matters once painted art lands —
   * declaring it now keeps layouts stable through the swap.
   */
  focal?: ArtworkFocal;
  className?: string;
}

/**
 * The single place artwork is cropped and framed. Screens never size raw
 * artwork directly — they choose an aspect and let the frame own the
 * background wash, border, and overflow, so placeholder SVGs can be swapped
 * for final hand-painted assets (transparent creature/item art, full-bleed
 * location art) without touching layouts. Aspect ratios reserve their
 * space before any asset loads, preventing layout shift; an empty frame
 * renders as a quiet wash, never a broken-image glyph.
 * See docs/art-direction.md.
 */
export function ArtworkFrame({
  children,
  aspect = "square",
  focal = "center",
  className = "",
}: ArtworkFrameProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-surface border border-border bg-gradient-to-b from-surface-sunken to-surface ${ASPECTS[aspect]} ${FOCALS[focal]} ${className}`.trim()}
    >
      <div className="absolute inset-0 flex items-center justify-center p-3 [&>img]:h-full [&>img]:w-full [&>img]:object-cover [&>svg]:h-full [&>svg]:w-full">
        {children ?? (
          <span aria-hidden="true" className="text-2xl opacity-40">
            ✦
          </span>
        )}
      </div>
    </div>
  );
}
