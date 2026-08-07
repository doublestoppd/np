import type { ConditionLevel } from "@/lib/pet-condition";

/**
 * Placeholder pet artwork built from simple original SVG shapes.
 * To be replaced with final original art.
 *
 * The art responds to two things, and only two:
 *
 * - **Spirits**, as the same 0–4 band the condition meters use. Every
 *   species' own description already promised something along these lines
 *   — a tail that glows when it is happy, fins that ripple — and until now
 *   the picture was byte-identical at spirits 100 and spirits 0, which
 *   made those descriptions untrue in writing.
 * - **How long it has been yours**, in whole seasons since adoption. This
 *   is deliberately age and not care: "a new leaf for every day it is well
 *   cared for" is a compliance meter with a plant on it, and CLAUDE.md
 *   rules out punitive inactivity. Time passing is something a player
 *   cannot fail at, and it makes a two-year companion visibly not a
 *   newcomer's.
 *
 * Neither is ever the only signal — the meters state both in words
 * (ADR-27), and this is the picture agreeing with them.
 */

interface PetArtProps {
  artKey: string;
  /** Accessible description, e.g. "Ember, a Cindertail". Empty = decorative. */
  label: string;
  /**
   * Spirits band, 0 (lowest) to 4. Defaults to a neutral 3 so decorative
   * and public renderings never imply anything about how a stranger's
   * companion is doing.
   */
  mood?: ConditionLevel;
  /** Whole seasons since adoption. Drives slow, permanent growth. */
  seasons?: number;
  className?: string;
}

interface VariantProps {
  mood: ConditionLevel;
  seasons: number;
}

/** Days in a season, for the growth a long companionship shows. */
export const SEASON_DAYS = 30;
/** Beyond this the picture stops changing; the record does not. */
export const MAX_SEASONS = 8;

/** How many whole seasons a companion adopted at `since` has seen. */
export function seasonsSince(since: Date, now: Date = new Date()): number {
  const days = (now.getTime() - since.getTime()) / 86_400_000;
  return Math.max(0, Math.min(MAX_SEASONS, Math.floor(days / SEASON_DAYS)));
}

/**
 * The mouth, from a flat line at low spirits to a proper smile at high.
 * Never a frown: a companion having a quiet day is not reproaching you.
 */
function Mouth({ mood, y, stroke }: { mood: ConditionLevel; y: number; stroke: string }) {
  const curve = [0, 2, 4, 8, 11][mood] ?? 8;
  return (
    <path
      d={`M92 ${y}q8 ${curve} 16 0`}
      stroke={stroke}
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    />
  );
}

/** Eyes narrow a little when spirits are low; they never close. */
function Eyes({
  mood,
  y,
  fill,
}: {
  mood: ConditionLevel;
  y: number;
  fill: string;
}) {
  const r = [5.5, 6, 6.5, 7, 7][mood] ?? 7;
  return (
    <>
      <circle cx="84" cy={y} r={r} fill={fill} />
      <circle cx="116" cy={y} r={r} fill={fill} />
      <circle cx="86.5" cy={y - 2.5} r="2.5" fill="#fff" />
      <circle cx="118.5" cy={y - 2.5} r="2.5" fill="#fff" />
    </>
  );
}

function Cindertail({ mood, seasons }: VariantProps) {
  // "…whose tail tip glows softly when it is happy." The flame is the
  // species' own promise, so it is what carries the mood here.
  const flame = 0.55 + mood * 0.15;
  const glow = 0.15 + mood * 0.2;
  return (
    <>
      <g style={{ transformOrigin: "150px 130px", transform: `scale(${flame})` }}>
        <circle cx="176" cy="118" r="34" fill="#fbbf24" opacity={glow * 0.35} />
        <path
          d="M156 118c18-4 30-18 28-36 8 10 10 22 6 32 10-2 16-8 18-16 6 22-10 44-34 46l-18-26Z"
          fill="#f59e0b"
        />
        <path d="M170 108c8-6 10-16 6-24 10 8 12 22 4 32l-10-8Z" fill="#fbbf24" />
      </g>
      {/* body */}
      <ellipse cx="100" cy="122" rx="58" ry="46" fill="#ea580c" />
      <ellipse cx="100" cy="136" rx="40" ry="28" fill="#fdba74" />
      {/* head bumps — one more ridge for every couple of seasons */}
      <circle cx="72" cy="84" r="16" fill="#ea580c" />
      <circle cx="100" cy="76" r="16" fill="#ea580c" />
      <circle cx="128" cy="84" r="16" fill="#ea580c" />
      {Array.from({ length: Math.floor(seasons / 2) }, (_, i) => (
        <circle
          key={i}
          cx={100 + (i % 2 === 0 ? -1 : 1) * (34 + i * 5)}
          cy={70 - i * 4}
          r={7 - i}
          fill="#c2410c"
        />
      ))}
      <Eyes mood={mood} y={106} fill="#292524" />
      <Mouth mood={mood} y={122} stroke="#292524" />
      {/* feet */}
      <ellipse cx="74" cy="164" rx="14" ry="8" fill="#c2410c" />
      <ellipse cx="126" cy="164" rx="14" ry="8" fill="#c2410c" />
    </>
  );
}

function Thornbud({ mood, seasons }: VariantProps) {
  // "…puts out another leaf for every season it has been with you."
  const lift = mood * 1.5;
  return (
    <>
      {/* leaves */}
      <path d={`M100 ${30 - lift}c14 8 14 28 0 38-14-10-14-30 0-38Z`} fill="#16a34a" />
      <path d={`M76 ${44 - lift}c16 2 22 20 12 32-16-4-22-22-12-32Z`} fill="#22c55e" />
      <path d={`M124 ${44 - lift}c-16 2-22 20-12 32 16-4 22-22 12-32Z`} fill="#22c55e" />
      {/* One more leaf per season, alternating sides and fanning outward. */}
      {Array.from({ length: seasons }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const rank = Math.floor(i / 2);
        const x = 100 + side * (26 + rank * 12);
        const y = 54 + rank * 9 - lift;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx="16"
            ry="7"
            fill={i % 3 === 0 ? "#4ade80" : "#22c55e"}
            transform={`rotate(${side * (25 + rank * 8)} ${x} ${y})`}
          />
        );
      })}
      {/* body */}
      <ellipse cx="100" cy="124" rx="54" ry="48" fill="#4ade80" />
      <ellipse cx="100" cy="140" rx="36" ry="26" fill="#bbf7d0" />
      <Eyes mood={mood} y={112} fill="#14532d" />
      <Mouth mood={mood} y={128} stroke="#14532d" />
      {/* cheeks */}
      <circle cx="70" cy="124" r="6" fill="#86efac" />
      <circle cx="130" cy="124" r="6" fill="#86efac" />
      {/* feet */}
      <ellipse cx="76" cy="168" rx="13" ry="7" fill="#16a34a" />
      <ellipse cx="124" cy="168" rx="13" ry="7" fill="#16a34a" />
    </>
  );
}

function Mistfin({ mood, seasons }: VariantProps) {
  // "…feathery fins that ripple like morning fog on water." The fins
  // spread when spirits are up and settle when they are not.
  const spread = 16 + mood * 4;
  return (
    <>
      <ellipse
        cx="62"
        cy="76"
        rx={spread}
        ry="10"
        fill="#38bdf8"
        transform="rotate(-30 62 76)"
      />
      <ellipse
        cx="138"
        cy="76"
        rx={spread}
        ry="10"
        fill="#38bdf8"
        transform="rotate(30 138 76)"
      />
      <ellipse cx="100" cy="58" rx="10" ry={14 + mood * 2} fill="#38bdf8" />
      {/* body */}
      <ellipse cx="100" cy="126" rx="56" ry="46" fill="#0ea5e9" />
      <ellipse cx="100" cy="142" rx="38" ry="26" fill="#bae6fd" />
      {/* tail fin, fuller with the seasons */}
      <path
        d={`M150 140c${16 + seasons * 2} 2 ${24 + seasons * 3} 12 ${26 + seasons * 3} 24-14 2-26-4-32-14l6-10Z`}
        fill="#38bdf8"
      />
      <Eyes mood={mood} y={112} fill="#0c4a6e" />
      <Mouth mood={mood} y={128} stroke="#0c4a6e" />
      {/* belly ripple */}
      <path
        d="M78 150q6 5 12 0t12 0 12 0 8 0"
        stroke="#7dd3fc"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

const ART_VARIANTS: Record<string, (props: VariantProps) => React.ReactNode> = {
  cindertail: Cindertail,
  thornbud: Thornbud,
  mistfin: Mistfin,
};

function Fallback({ mood }: VariantProps) {
  return (
    <>
      <ellipse cx="100" cy="120" rx="54" ry="48" fill="#a8a29e" />
      <Eyes mood={mood} y={108} fill="#292524" />
      <Mouth mood={mood} y={126} stroke="#292524" />
    </>
  );
}

export function PetArt({
  artKey,
  label,
  mood = 3,
  seasons = 0,
  className,
}: PetArtProps) {
  const Variant = ART_VARIANTS[artKey] ?? Fallback;
  return (
    <svg
      viewBox="0 0 200 190"
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <Variant mood={mood} seasons={Math.max(0, Math.min(MAX_SEASONS, seasons))} />
    </svg>
  );
}
