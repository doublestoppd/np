import { PLACE_ICON_KEYS } from "./sourced-icons";
import { PLACE_ICON_MAP } from "@/lib/art-credits";
import { SourcedArt } from "./sourced-art";
import { TINT_INK } from "@/lib/content-tint";
import { LocationScene } from "./location-scene";

/**
 * Placeholder location artwork: an original painted ground with a sourced
 * silhouette standing on it.
 *
 * Two layers, and the split is the point:
 *
 * - The **ground** is ours (`LocationScene`). It is composed
 *   deterministically from the place's key, so every one of the sixteen
 *   locations gets its own light, horizon, hills, and scatter instead of
 *   the two shared backdrops this replaced — while the region still owns
 *   the whole palette, which is what keeps Saltmere's flats from ever
 *   looking like Dapplewood's wood.
 * - The **subject** is a silhouette from the same collection the items
 *   use, painted in the place's own hue, so a place and the things you
 *   find there speak one visual language.
 *
 * Replaced later by full-bleed `public/art/locations/<artKey>/hero.webp`
 * (docs/art-direction.md).
 */

interface LocationArtProps {
  artKey: string;
  /** Accessible description, e.g. "Mosslight Clearing". */
  label: string;
  className?: string;
}

export function LocationArt({ artKey, label, className }: LocationArtProps) {
  // Decorative uses pass an empty label; expose no unnamed img node then.
  const decorative = label.trim() === "";
  const place = PLACE_ICON_MAP[artKey];
  const terrain = place?.terrain ?? "wood";
  const hasSubject = place !== undefined && PLACE_ICON_KEYS.has(artKey);
  /**
   * Each place is painted in its own hue rather than one ink per region.
   * One ink made a map of eight places into eight identical silhouettes —
   * distinct shapes, but nothing to catch the eye between them. Deep
   * rather than mid, because a subject has to hold against a busy ground.
   */
  const ink = TINT_INK[place?.tint ?? "moss"].deep;

  return (
    <div
      // Always fills its frame. Call sites hand this to ArtworkFrame,
      // whose sizing rules target `svg` and `img` children — a bare div
      // would have collapsed to nothing in three of the four places this
      // is used.
      className={`relative h-full w-full ${className ?? ""}`.trim()}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <svg
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <LocationScene artKey={artKey} terrain={terrain} />
        {/* The subject's shadow, so it sits on the ground instead of
            hovering over it. Drawn here rather than under the mask
            because a mask has no shadow to give. */}
        {hasSubject && (
          <ellipse
            cx="160"
            cy="150"
            rx="66"
            ry="10"
            fill={ink}
            opacity="0.18"
          />
        )}
      </svg>
      {hasSubject && (
        <SourcedArt
          set="places"
          artKey={artKey}
          ink={ink}
          label=""
          position="bottom"
          // Bottom-anchored inside the middle band: the ground line sits
          // around 83% of the frame, and the subject reads at both the
          // card size and the full-width hero without a second crop.
          className="absolute inset-x-0 bottom-[17%] top-[14%]"
        />
      )}
    </div>
  );
}
