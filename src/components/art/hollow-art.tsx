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
      <rect x="0" y="0" width="200" height="112" fill={wash.sky} />
      <rect
        x="0"
        y={horizon}
        width="200"
        height={112 - horizon}
        fill={wash.ground}
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
 * One furnishing, drawn inside a 100x100 box anchored at the bottom
 * centre so it stands on the ground rather than floating.
 *
 * `stage` is how far a growing thing has come: it scales the silhouette
 * and nothing else. A furnishing that does not grow is always at its last
 * stage, so there is one code path.
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

  let shapes: React.ReactNode;
  switch (size) {
    case "CENTREPIECE":
      shapes = (
        <>
          <ellipse cx="50" cy="94" rx="34" ry="6" fill={hue.deep} opacity="0.35" />
          <rect x="38" y="52" width="24" height="42" rx="3" fill={hue.main} />
          <circle cx="50" cy="42" r="24" fill="none" stroke={hue.deep} strokeWidth="4" />
          <circle cx="50" cy="42" r="14" fill={hue.soft} />
          <circle cx="50" cy="42" r="5" fill={hue.deep} />
        </>
      );
      break;
    case "LARGE":
      shapes = (
        <>
          <ellipse cx="50" cy="94" rx="30" ry="5" fill={hue.deep} opacity="0.3" />
          <path d="M18 94V38l32-20 32 20v56Z" fill={hue.main} />
          <path d="M18 38 50 18l32 20Z" fill={hue.soft} />
          <rect x="40" y="62" width="20" height="32" rx="2" fill={hue.deep} />
        </>
      );
      break;
    case "MEDIUM":
      shapes = (
        <>
          <ellipse cx="50" cy="94" rx="24" ry="4" fill={hue.deep} opacity="0.3" />
          <rect x="46" y="44" width="8" height="50" rx="3" fill={hue.deep} />
          <path d="M50 30q22 6 22 22-22 8-44 0 0-16 22-22Z" fill={hue.main} />
          <path d="M50 30q0 22 0 34" stroke={hue.soft} strokeWidth="3" fill="none" />
        </>
      );
      break;
    default:
      shapes = (
        <>
          <ellipse cx="50" cy="94" rx="20" ry="4" fill={hue.deep} opacity="0.3" />
          <path d="M26 92q0-22 24-22t24 22Z" fill={hue.main} />
          <path d="M34 84q6-10 16-10t16 10Z" fill={hue.soft} />
        </>
      );
  }

  return (
    <svg viewBox="0 0 100 100" className={className} {...a11y}>
      <g
        style={{ transformOrigin: "50px 94px", transform: `scale(${grown})` }}
      >
        {shapes}
      </g>
    </svg>
  );
}
