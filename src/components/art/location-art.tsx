import { PLACE_ICON_KEYS } from "./sourced-icons";
import { PLACE_ICON_MAP } from "@/lib/art-credits";
import { SourcedArt } from "./sourced-art";
import { TINT_INK } from "@/lib/content-tint";

/**
 * Placeholder location artwork: an original painted ground with a sourced
 * silhouette standing on it.
 *
 * The split is the point. The **ground** is ours and stays ours — it is
 * the only thing that makes Saltmere's pale flats not look like
 * Dapplewood's green wood, and no borrowed icon can carry a region's
 * weather. The **subject** is a silhouette from the same collection the
 * items use, so a place and the things you find there speak one visual
 * language.
 *
 * This replaced sixteen hand-drawn scenes of sixteen different qualities.
 * Two of them had no subject at all: the world map showed each region as a
 * bare backdrop with a caption, which is a picture of nothing.
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

/** Dapplewood's ground: warm, green, and layered back to front. */
function Woodland() {
  return (
    <>
      <rect width="320" height="180" fill="#dbe6d3" />
      <ellipse cx="80" cy="190" rx="180" ry="70" fill="#b9cfa6" />
      <ellipse cx="270" cy="200" rx="190" ry="80" fill="#a3bf90" />
      <circle cx="264" cy="40" r="18" fill="#f3ecd2" />
      <Tree x={-16} scale={0.85} />
      <Tree x={262} scale={0.95} />
    </>
  );
}

/**
 * Saltmere's ground: flat, wet, and pale. Deliberately nothing like the
 * wood — the whole point of the region is that it does not look like it.
 */
function Flats() {
  return (
    <>
      <rect width="320" height="180" fill="#d9dee0" />
      <rect y="96" width="320" height="84" fill="#b9c0c2" />
      <path d="M0 108q80-10 160 0t160 0v72H0Z" fill="#a9b2b4" />
      {/* Standing water, left behind rather than arriving. */}
      <ellipse cx="90" cy="150" rx="86" ry="12" fill="#c3ced1" />
      <ellipse cx="242" cy="166" rx="72" ry="10" fill="#c3ced1" />
      <circle cx="252" cy="38" r="16" fill="#e9edee" />
      <Post x={24} height={44} />
      <Post x={292} height={32} />
    </>
  );
}

/** A weathered post — the flats are full of them and few explain why. */
function Post({ x, height = 40 }: { x: number; height?: number }) {
  return (
    <>
      <rect x={x} y={124 - height} width="5" height={height} rx="2" fill="#6f6a63" />
      <rect x={x - 3} y={124 - height} width="11" height="4" rx="2" fill="#5d584f" />
    </>
  );
}

function Tree({ x, scale = 1 }: { x: number; scale?: number }) {
  return (
    <g transform={`translate(${x} 0) scale(${scale})`}>
      <rect x="26" y="96" width="8" height="26" rx="3" fill="#6e5a3e" />
      <circle cx="30" cy="78" r="26" fill="#5d8050" />
      <circle cx="16" cy="90" r="16" fill="#6f9460" />
      <circle cx="45" cy="90" r="15" fill="#547548" />
    </g>
  );
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
        {terrain === "flats" ? <Flats /> : <Woodland />}
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
