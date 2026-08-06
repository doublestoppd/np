/**
 * Placeholder location artwork: simple original flat scenes keyed by artKey.
 * Replaced later by full-bleed `public/art/locations/<artKey>/hero.webp`
 * (docs/art-direction.md). Deliberately provisional — no final motif.
 */

interface LocationArtProps {
  artKey: string;
  /** Accessible description, e.g. "Mosslight Clearing". */
  label: string;
  className?: string;
}

function Backdrop() {
  return (
    <>
      <rect width="320" height="180" fill="#dbe6d3" />
      <ellipse cx="80" cy="190" rx="180" ry="70" fill="#b9cfa6" />
      <ellipse cx="270" cy="200" rx="190" ry="80" fill="#a3bf90" />
      <circle cx="264" cy="40" r="18" fill="#f3ecd2" />
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

function Scene({ artKey }: { artKey: string }) {
  switch (artKey) {
    case "mosslight-clearing":
      return (
        <>
          <Backdrop />
          <Tree x={4} />
          <Tree x={244} scale={1.1} />
          <ellipse cx="160" cy="140" rx="86" ry="26" fill="#8fb97e" />
          <ellipse cx="160" cy="136" rx="56" ry="16" fill="#c9e3ae" />
          <circle cx="138" cy="120" r="5" fill="#eef7d9" />
          <circle cx="176" cy="128" r="4" fill="#eef7d9" />
          <circle cx="158" cy="112" r="3" fill="#eef7d9" />
        </>
      );
    case "old-footbridge":
      return (
        <>
          <Backdrop />
          <path d="M0 150q160-24 320 0V180H0Z" fill="#7fa7b5" />
          <path d="M60 132q100-44 200 0v16q-100-36-200 0Z" fill="#9b8a70" />
          <path d="M60 132q100-44 200 0" stroke="#7a6b54" strokeWidth="6" fill="none" />
          <rect x="86" y="116" width="6" height="22" fill="#7a6b54" />
          <rect x="156" y="104" width="6" height="24" fill="#7a6b54" />
          <rect x="226" y="116" width="6" height="22" fill="#7a6b54" />
          <Tree x={10} scale={0.9} />
        </>
      );
    case "toadstool-hollow":
      return (
        <>
          <rect width="320" height="180" fill="#cfd8c4" />
          <ellipse cx="160" cy="200" rx="230" ry="90" fill="#93a681" />
          <Tree x={228} scale={1.15} />
          <g>
            <rect x="96" y="112" width="14" height="30" rx="6" fill="#efe6d2" />
            <path d="M76 116a27 18 0 0 1 54 0Z" fill="#b0563f" />
            <circle cx="92" cy="106" r="4" fill="#f2e8d8" />
            <circle cx="112" cy="108" r="3" fill="#f2e8d8" />
          </g>
          <g>
            <rect x="152" y="124" width="10" height="22" rx="5" fill="#efe6d2" />
            <path d="M138 128a19 13 0 0 1 38 0Z" fill="#c47a4a" />
          </g>
        </>
      );
    case "dapplewood":
      return (
        <>
          <Backdrop />
          <Tree x={20} />
          <Tree x={120} scale={1.15} />
          <Tree x={240} scale={0.95} />
          <ellipse cx="160" cy="156" rx="120" ry="18" fill="#8fb97e" />
        </>
      );
    default:
      return (
        <>
          <Backdrop />
          <Tree x={40} />
          <Tree x={220} />
        </>
      );
  }
}

export function LocationArt({ artKey, label, className }: LocationArtProps) {
  // Decorative uses pass an empty label; expose no unnamed img node then.
  const decorative = label.trim() === "";
  return (
    <svg
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      className={className}
    >
      <Scene artKey={artKey} />
    </svg>
  );
}
