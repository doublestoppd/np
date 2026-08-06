/**
 * Placeholder pet artwork built from simple original SVG shapes.
 * To be replaced with final original art.
 */

interface PetArtProps {
  artKey: string;
  /** Accessible description, e.g. "Ember, a Cindertail". */
  label: string;
  className?: string;
}

function Cindertail() {
  return (
    <>
      {/* flame-tipped tail */}
      <path
        d="M156 118c18-4 30-18 28-36 8 10 10 22 6 32 10-2 16-8 18-16 6 22-10 44-34 46l-18-26Z"
        fill="#f59e0b"
      />
      <path
        d="M170 108c8-6 10-16 6-24 10 8 12 22 4 32l-10-8Z"
        fill="#fbbf24"
      />
      {/* body */}
      <ellipse cx="100" cy="122" rx="58" ry="46" fill="#ea580c" />
      <ellipse cx="100" cy="136" rx="40" ry="28" fill="#fdba74" />
      {/* head bumps */}
      <circle cx="72" cy="84" r="16" fill="#ea580c" />
      <circle cx="100" cy="76" r="16" fill="#ea580c" />
      <circle cx="128" cy="84" r="16" fill="#ea580c" />
      {/* eyes */}
      <circle cx="84" cy="106" r="7" fill="#292524" />
      <circle cx="116" cy="106" r="7" fill="#292524" />
      <circle cx="86.5" cy="103.5" r="2.5" fill="#fff" />
      <circle cx="118.5" cy="103.5" r="2.5" fill="#fff" />
      {/* smile */}
      <path
        d="M92 122q8 8 16 0"
        stroke="#292524"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* feet */}
      <ellipse cx="74" cy="164" rx="14" ry="8" fill="#c2410c" />
      <ellipse cx="126" cy="164" rx="14" ry="8" fill="#c2410c" />
    </>
  );
}

function Thornbud() {
  return (
    <>
      {/* leaves */}
      <path d="M100 30c14 8 14 28 0 38-14-10-14-30 0-38Z" fill="#16a34a" />
      <path d="M76 44c16 2 22 20 12 32-16-4-22-22-12-32Z" fill="#22c55e" />
      <path d="M124 44c-16 2-22 20-12 32 16-4 22-22 12-32Z" fill="#22c55e" />
      {/* body */}
      <ellipse cx="100" cy="124" rx="54" ry="48" fill="#4ade80" />
      <ellipse cx="100" cy="140" rx="36" ry="26" fill="#bbf7d0" />
      {/* eyes */}
      <circle cx="84" cy="112" r="7" fill="#14532d" />
      <circle cx="116" cy="112" r="7" fill="#14532d" />
      <circle cx="86.5" cy="109.5" r="2.5" fill="#fff" />
      <circle cx="118.5" cy="109.5" r="2.5" fill="#fff" />
      {/* smile */}
      <path
        d="M92 128q8 8 16 0"
        stroke="#14532d"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* cheeks */}
      <circle cx="70" cy="124" r="6" fill="#86efac" />
      <circle cx="130" cy="124" r="6" fill="#86efac" />
      {/* feet */}
      <ellipse cx="76" cy="168" rx="13" ry="7" fill="#16a34a" />
      <ellipse cx="124" cy="168" rx="13" ry="7" fill="#16a34a" />
    </>
  );
}

function Mistfin() {
  return (
    <>
      {/* feathery head fins */}
      <ellipse cx="62" cy="76" rx="20" ry="10" fill="#38bdf8" transform="rotate(-30 62 76)" />
      <ellipse cx="138" cy="76" rx="20" ry="10" fill="#38bdf8" transform="rotate(30 138 76)" />
      <ellipse cx="100" cy="58" rx="10" ry="18" fill="#38bdf8" />
      {/* body */}
      <ellipse cx="100" cy="126" rx="56" ry="46" fill="#0ea5e9" />
      <ellipse cx="100" cy="142" rx="38" ry="26" fill="#bae6fd" />
      {/* tail fin */}
      <path d="M150 140c16 2 24 12 26 24-14 2-26-4-32-14l6-10Z" fill="#38bdf8" />
      {/* eyes */}
      <circle cx="84" cy="112" r="7" fill="#0c4a6e" />
      <circle cx="116" cy="112" r="7" fill="#0c4a6e" />
      <circle cx="86.5" cy="109.5" r="2.5" fill="#fff" />
      <circle cx="118.5" cy="109.5" r="2.5" fill="#fff" />
      {/* smile */}
      <path
        d="M92 128q8 8 16 0"
        stroke="#0c4a6e"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
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

const ART_VARIANTS: Record<string, () => React.ReactNode> = {
  cindertail: Cindertail,
  thornbud: Thornbud,
  mistfin: Mistfin,
};

function Fallback() {
  return (
    <>
      <ellipse cx="100" cy="120" rx="54" ry="48" fill="#a8a29e" />
      <circle cx="84" cy="108" r="7" fill="#292524" />
      <circle cx="116" cy="108" r="7" fill="#292524" />
      <path
        d="M92 126q8 8 16 0"
        stroke="#292524"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

export function PetArt({ artKey, label, className }: PetArtProps) {
  const Variant = ART_VARIANTS[artKey] ?? Fallback;
  return (
    <svg
      viewBox="0 0 200 190"
      role="img"
      aria-label={label}
      className={className}
    >
      <Variant />
    </svg>
  );
}
