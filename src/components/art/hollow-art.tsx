/**
 * Placeholder Hollow artwork: original flat shapes for the painted grounds
 * and the furnishings that stand in them, plus the wash an air puts over
 * the whole picture. Replaced later by `public/art/hollow/<artKey>.webp`
 * and transparent furnishing art keyed the same way
 * (docs/art-direction.md).
 *
 * Raw colour lives here on purpose. This is the art layer, and its job is
 * to be thrown away wholesale when painted assets land; components outside
 * it consume design tokens and never a hex value.
 */
import { ITEM_ICON_KEYS } from "./item-icons";

interface AirWash {
  sky: string;
  ground: string;
  /** Overlay tint for the whole frame; "transparent" for plain daylight. */
  veil: string;
}

const DEFAULT_WASH: AirWash = {
  sky: "#cfe0e8",
  ground: "#b9c79a",
  veil: "transparent",
};

const AIR_WASHES: Record<string, AirWash> = {
  "open-day": DEFAULT_WASH,
  "first-thaw": { sky: "#dfe7ec", ground: "#c3c8bb", veil: "#eef3f6" },
  "low-gold": { sky: "#f0d5a8", ground: "#c1a566", veil: "#f4c98a" },
  "soft-rain": { sky: "#b9c0c4", ground: "#9aa891", veil: "#c8d0d4" },
};

/** Horizon height as a percentage, chosen per ground so they differ. */
const HORIZONS: Record<string, number> = {
  "hollow-lantern-clearing": 46,
  "hollow-shallow-bank": 42,
  "hollow-walled-garden": 38,
  "hollow-high-shelf": 34,
};

function washFor(airKey: string) {
  return AIR_WASHES[airKey] ?? DEFAULT_WASH;
}

/**
 * The backdrop for one ground under one air. Fills its container; the
 * caller positions furnishings over it.
 */
export function GroundArt({
  artKey,
  airKey,
  label,
  className = "",
}: {
  artKey: string;
  airKey: string;
  /** Accessible name, or "" when the surrounding text already says it. */
  label: string;
  className?: string;
}) {
  const wash = washFor(airKey);
  const horizon = HORIZONS[artKey] ?? 42;
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <svg viewBox="0 0 200 112" preserveAspectRatio="none" className={className} {...a11y}>
      <defs>
        <linearGradient id={`sky-${artKey}-${airKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={wash.sky} />
          <stop offset="100%" stopColor={wash.veil === "transparent" ? wash.sky : wash.veil} />
        </linearGradient>
        <linearGradient id={`ground-${artKey}-${airKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={wash.ground} stopOpacity="0.75" />
          <stop offset="100%" stopColor={wash.ground} />
        </linearGradient>
      </defs>
      <rect
        x="0"
        y="0"
        width="200"
        height="112"
        fill={`url(#sky-${artKey}-${airKey})`}
      />
      {/* A far band behind the horizon: without it the ground meets the
          sky on a hard line and the picture has no depth for a furnishing
          to stand in. */}
      <rect
        x="0"
        y={horizon - 9}
        width="200"
        height="11"
        fill={wash.ground}
        opacity="0.45"
      />
      <rect
        x="0"
        y={horizon}
        width="200"
        height={112 - horizon}
        fill={`url(#ground-${artKey}-${airKey})`}
      />
      {artKey === "hollow-shallow-bank" && (
        <path
          d={`M0 ${horizon + 18} Q60 ${horizon + 8} 110 ${horizon + 22} T200 ${horizon + 16} L200 112 L0 112 Z`}
          fill={wash.sky}
          opacity="0.65"
        />
      )}
      {artKey === "hollow-walled-garden" && (
        <rect
          x="6"
          y={horizon - 14}
          width="188"
          height="16"
          rx="2"
          fill="#000"
          opacity="0.12"
        />
      )}
      {artKey === "hollow-high-shelf" && (
        <path
          d={`M0 ${horizon} L46 ${horizon - 14} L88 ${horizon - 4} L134 ${horizon - 18} L200 ${horizon - 6} L200 ${horizon} Z`}
          fill="#000"
          opacity="0.1"
        />
      )}
      {artKey === "hollow-lantern-clearing" && (
        <>
          <ellipse cx="24" cy={horizon - 6} rx="30" ry="14" fill="#000" opacity="0.1" />
          <ellipse cx="176" cy={horizon - 8} rx="32" ry="15" fill="#000" opacity="0.1" />
        </>
      )}
      {wash.veil !== "transparent" && (
        <rect
          x="0"
          y="0"
          width="200"
          height="112"
          fill={wash.veil}
          opacity="0.22"
        />
      )}
    </svg>
  );
}

const HUES = [
  { main: "#8a6f4e", soft: "#d9c7ab", deep: "#5f4a30" },
  { main: "#6f7f66", soft: "#c6d2bd", deep: "#4a5843" },
  { main: "#7e6a76", soft: "#ccbcc6", deep: "#57454f" },
  { main: "#6d7c8c", soft: "#c2cdd8", deep: "#465563" },
] as const;

function hueFor(artKey: string) {
  let hash = 0;
  for (const char of artKey) {
    hash = (hash * 31 + char.charCodeAt(0)) % 991;
  }
  return HUES[hash % HUES.length] ?? HUES[0];
}

/**
 * One furnishing, drawn inside a square box anchored at the bottom centre
 * so it stands on the ground rather than floating.
 *
 * `stage` is how far a growing thing has come: it scales the silhouette
 * and nothing else. A furnishing that does not grow is always at its last
 * stage, so there is one code path.
 *
 * Where the item has a sourced silhouette it is used here too, for the
 * reason it exists at all: the generic shapes below come in three or four
 * variants per size, so a Long Bench and a Steadying Stone drew the same
 * rectangle, and a player who had saved for a specific object could not
 * see which one they had put down. The shadow and the growth scale stay
 * either way — both carry real information the icon cannot.
 */
export function FurnishingArt({
  artKey,
  size,
  stage,
  stages,
  label,
  className = "",
}: {
  artKey: string;
  size: string;
  stage: number;
  stages: number;
  label: string;
  className?: string;
}) {
  const hue = hueFor(artKey);
  const grown = stages <= 1 ? 1 : 0.45 + (0.55 * stage) / (stages - 1);
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  if (ITEM_ICON_KEYS.has(artKey)) {
    const mask = `url("/art/items/${encodeURIComponent(artKey)}.svg")`;
    return (
      // `aspect-square` and `h-full` together on purpose: the Hollow's
      // scene gives this a width and lets the height follow, while the
      // catalogue drops it into a frame that already has a definite square
      // — a definite height wins, an auto one falls back to the ratio. With
      // only the ratio the catalogue art collapsed to nothing.
      <div
        className={`relative aspect-square h-full w-full ${className}`.trim()}
        {...a11y}
      >
        <div
          className="absolute inset-0"
          style={{ transformOrigin: "50% 96%", transform: `scale(${grown})` }}
        >
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <ellipse cx="50" cy="95" rx="26" ry="4" fill={hue.deep} opacity="0.28" />
          </svg>
          <span
            className="absolute inset-0"
            style={{
              backgroundColor: hue.deep,
              maskImage: mask,
              WebkitMaskImage: mask,
              maskSize: "contain",
              WebkitMaskSize: "contain",
              maskRepeat: "no-repeat",
              WebkitMaskRepeat: "no-repeat",
              // Bottom, not centre: these stand on a ground line in a
              // painted scene, and a centred object hovers above its own
              // shadow.
              maskPosition: "bottom center",
              WebkitMaskPosition: "bottom center",
            }}
          />
        </div>
      </div>
    );
  }

  const variants = SILHOUETTES[size] ?? SILHOUETTES.SMALL ?? [];
  const shapes = variants[variantFor(artKey, variants.length)]?.(hue);

  return (
    <svg viewBox="0 0 100 100" className={className} {...a11y}>
      <g style={{ transformOrigin: "50px 94px", transform: `scale(${grown})` }}>
        <ellipse cx="50" cy="95" rx="26" ry="4" fill={hue.deep} opacity="0.28" />
        {shapes}
      </g>
    </svg>
  );
}

/** Picks a silhouette deterministically, so an object always looks itself. */
function variantFor(artKey: string, count: number): number {
  let hash = 7;
  for (const char of artKey) {
    hash = (hash * 37 + char.charCodeAt(0)) % 8191;
  }
  return count === 0 ? 0 : hash % count;
}

type Hue = (typeof HUES)[number];

/**
 * Placeholder silhouettes, several per size.
 *
 * One shape per size would have made eight small things look like the same
 * object in eight tints, which is worse than no art: a catalogue you
 * cannot tell apart at a glance is a list, not a shop. Each is drawn
 * standing on the ground line at y=94 so it sits at an anchor properly.
 */
const SILHOUETTES: Record<string, Array<(hue: Hue) => React.ReactNode>> = {
  SMALL: [
    // A low stone.
    (hue) => (
      <>
        <path d="M18 94q4-26 32-26t32 26Z" fill={hue.main} />
        <path d="M30 82q8-10 20-10t20 10Z" fill={hue.soft} />
      </>
    ),
    // Something hanging from a hook.
    (hue) => (
      <>
        <path d="M50 12v18" stroke={hue.deep} strokeWidth="5" fill="none" />
        <path d="M32 94V56q0-18 18-18t18 18v38Z" fill={hue.main} />
        <ellipse cx="50" cy="56" rx="18" ry="6" fill={hue.soft} />
        <path d="M68 62q10 4 8 14" stroke={hue.deep} strokeWidth="5" fill="none" />
      </>
    ),
    // A small crate or box.
    (hue) => (
      <>
        <rect x="24" y="52" width="52" height="42" rx="3" fill={hue.main} />
        <rect x="24" y="52" width="52" height="10" rx="3" fill={hue.soft} />
        <path d="M24 74h52" stroke={hue.deep} strokeWidth="4" />
      </>
    ),
    // A post with something on top.
    (hue) => (
      <>
        <rect x="45" y="40" width="10" height="54" rx="3" fill={hue.deep} />
        <circle cx="50" cy="34" r="18" fill={hue.main} />
        <circle cx="50" cy="34" r="9" fill={hue.soft} />
      </>
    ),
  ],
  MEDIUM: [
    // A branch holding things.
    (hue) => (
      <>
        <rect x="46" y="34" width="9" height="60" rx="3" fill={hue.deep} />
        <path d="M50 44q20 2 26 16M50 54q-18 2-24 14" stroke={hue.main} strokeWidth="5" fill="none" />
        <circle cx="78" cy="62" r="8" fill={hue.soft} />
        <circle cx="24" cy="70" r="7" fill={hue.soft} />
      </>
    ),
    // A step or low wall.
    (hue) => (
      <>
        <rect x="10" y="66" width="80" height="28" rx="3" fill={hue.main} />
        <rect x="20" y="52" width="60" height="16" rx="3" fill={hue.soft} />
        <path d="M10 80h80" stroke={hue.deep} strokeWidth="4" />
      </>
    ),
    // A bench.
    (hue) => (
      <>
        <rect x="12" y="60" width="76" height="12" rx="4" fill={hue.main} />
        <rect x="18" y="72" width="10" height="22" rx="3" fill={hue.deep} />
        <rect x="72" y="72" width="10" height="22" rx="3" fill={hue.deep} />
        <rect x="12" y="44" width="76" height="9" rx="4" fill={hue.soft} />
      </>
    ),
    // A young tree.
    (hue) => (
      <>
        <rect x="46" y="52" width="9" height="42" rx="4" fill={hue.deep} />
        <path d="M50 12q26 16 20 34-20 10-40 0-6-18 20-34Z" fill={hue.main} />
        <path d="M50 20q14 12 11 24" stroke={hue.soft} strokeWidth="4" fill="none" />
      </>
    ),
  ],
  LARGE: [
    // A gate.
    (hue) => (
      <>
        <rect x="12" y="30" width="10" height="64" rx="3" fill={hue.deep} />
        <rect x="78" y="30" width="10" height="64" rx="3" fill={hue.deep} />
        <rect x="22" y="46" width="56" height="9" rx="3" fill={hue.main} />
        <rect x="22" y="72" width="56" height="9" rx="3" fill={hue.main} />
        <path d="M24 80 76 48" stroke={hue.soft} strokeWidth="7" />
      </>
    ),
    // A basin on a plinth.
    (hue) => (
      <>
        <path d="M20 52h60l-8 20H28Z" fill={hue.main} />
        <ellipse cx="50" cy="52" rx="30" ry="8" fill={hue.soft} />
        <rect x="40" y="70" width="20" height="24" rx="3" fill={hue.deep} />
        <rect x="30" y="90" width="40" height="6" rx="3" fill={hue.main} />
      </>
    ),
    // A frame, mostly glass gone.
    (hue) => (
      <>
        <path d="M14 94V44L50 18l36 26v50Z" fill={hue.soft} opacity="0.7" />
        <path d="M14 44 50 18l36 26" stroke={hue.deep} strokeWidth="5" fill="none" />
        <path d="M14 94V44M86 94V44M50 18v76M14 68h72" stroke={hue.main} strokeWidth="5" />
      </>
    ),
    // Two leaning stones.
    (hue) => (
      <>
        <path d="M16 94 26 34l22 60Z" fill={hue.main} />
        <path d="M56 94 74 40l14 54Z" fill={hue.deep} />
        <path d="M26 34 38 66l-10 2Z" fill={hue.soft} />
      </>
    ),
  ],
  CENTREPIECE: [
    // Turning rings.
    (hue) => (
      <>
        <rect x="40" y="58" width="20" height="36" rx="3" fill={hue.deep} />
        <ellipse cx="50" cy="40" rx="34" ry="12" fill="none" stroke={hue.main} strokeWidth="5" />
        <ellipse cx="50" cy="40" rx="20" ry="30" fill="none" stroke={hue.deep} strokeWidth="4" />
        <circle cx="50" cy="40" r="10" fill={hue.soft} />
      </>
    ),
    // An arch.
    (hue) => (
      <>
        <path
          d="M14 94V50a36 36 0 0 1 72 0v44H68V50a18 18 0 0 0-36 0v44Z"
          fill={hue.main}
        />
        <path d="M32 50a18 18 0 0 1 36 0" stroke={hue.soft} strokeWidth="5" fill="none" />
      </>
    ),
    // A tiered fountain.
    (hue) => (
      <>
        <ellipse cx="50" cy="86" rx="38" ry="10" fill={hue.main} />
        <ellipse cx="50" cy="84" rx="30" ry="7" fill={hue.soft} />
        <rect x="44" y="52" width="12" height="30" rx="4" fill={hue.deep} />
        <ellipse cx="50" cy="50" rx="20" ry="6" fill={hue.main} />
        <path d="M50 24v22" stroke={hue.soft} strokeWidth="5" />
      </>
    ),
  ],
};
