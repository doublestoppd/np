/**
 * One silhouette, drawn from a vendored file.
 *
 * A CSS mask rather than an `<img>`, and that is the whole reason this
 * component exists rather than a one-line image tag: the colour comes from
 * the caller, so the same file reads as a warm object in a satchel and as
 * a dark subject on a painted map, and the entire presentation still
 * re-skins by editing palette tokens. Baking tint into a hundred static
 * files would have quietly broken that (docs/art-direction.md).
 *
 * Callers only ever reach this for keys the build script confirmed it
 * wrote, so a missing file cannot render as a solid coloured block.
 */
export function SourcedArt({
  /** `items` or `places` — the folder under public/art. */
  set,
  artKey,
  /** Any CSS colour; callers pass their own palette value. */
  ink,
  /** Accessible name. Empty string = decorative. */
  label,
  /**
   * Where the shape sits in its box. `bottom` is for anything standing on
   * a ground line — a furnishing at an anchor, a place on a horizon —
   * because a centred object hovers above its own shadow.
   */
  position = "center",
  className = "",
}: {
  set: "items" | "places";
  artKey: string;
  ink: string;
  label: string;
  position?: "center" | "bottom";
  className?: string;
}) {
  const mask = `url("/art/${set}/${encodeURIComponent(artKey)}.svg")`;
  const place = position === "bottom" ? "bottom center" : "center";
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={`block ${className}`.trim()}
      style={{
        backgroundColor: ink,
        maskImage: mask,
        WebkitMaskImage: mask,
        // `contain`, never `cover`: these are whole objects, and cropping
        // the handle off a lantern to fill a square is worse than leaving
        // air around it.
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: place,
        WebkitMaskPosition: place,
      }}
    />
  );
}
