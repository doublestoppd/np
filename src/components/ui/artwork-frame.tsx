export type ArtworkAspect = "square" | "wide" | "portrait";

const ASPECTS: Record<ArtworkAspect, string> = {
  square: "aspect-square",
  wide: "aspect-video",
  portrait: "aspect-4/5",
};

interface ArtworkFrameProps {
  children: React.ReactNode;
  aspect?: ArtworkAspect;
  className?: string;
}

/**
 * The single place artwork is cropped and framed. Screens never size raw
 * artwork directly — they choose an aspect and let the frame own the
 * background wash, border, and overflow, so placeholder SVGs can be swapped
 * for final hand-painted assets (transparent creature/item art, full-bleed
 * location art) without touching layouts. See docs/art-direction.md.
 */
export function ArtworkFrame({
  children,
  aspect = "square",
  className = "",
}: ArtworkFrameProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-surface border border-border bg-gradient-to-b from-accent-soft to-surface ${ASPECTS[aspect]} ${className}`.trim()}
    >
      <div className="absolute inset-0 flex items-center justify-center p-3 [&>img]:h-full [&>img]:w-full [&>img]:object-cover [&>svg]:h-full [&>svg]:w-full">
        {children}
      </div>
    </div>
  );
}
