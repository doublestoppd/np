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

/**
 * Saltmere's ground: flat, wet, and pale. Deliberately nothing like
 * `Backdrop` — the whole point of the region is that it does not look
 * like the wood.
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
    case "saltmere":
      return (
        <>
          <Flats />
          <Post x={54} height={52} />
          <Post x={72} height={34} />
          <Post x={238} height={44} />
          <path
            d="M120 118h84l-6 -14h-72Z"
            fill="#8b9295"
          />
        </>
      );
    case "lowwater-landing":
      return (
        <>
          <Flats />
          {/* A slipway running down into mud that is currently the mooring. */}
          <path d="M110 96h100l40 44H70Z" fill="#8f9a92" />
          <path d="M126 106h68l26 30H100Z" fill="#a4afa6" />
          <path d="M196 138q22 -18 44 -4l-6 18q-20 -6 -38 -14Z" fill="#7d7468" />
          <Post x={92} height={34} />
          <Post x={240} height={28} />
        </>
      );
    case "the-wrackline":
      return (
        <>
          <Flats />
          {/* The line itself: everything the water finished with. */}
          <path
            d="M0 128q80 10 160 -2t160 6"
            stroke="#8a8073"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="96" cy="126" r="6" fill="#7f9a86" />
          <rect x="150" y="118" width="14" height="9" rx="2" fill="#9a8f7d" />
          <path d="M212 130q8 -12 18 -2l-4 10h-12Z" fill="#6f6a63" />
          <Post x={30} height={24} />
        </>
      );
    case "the-drying-sheds":
      return (
        <>
          <Flats />
          {/* Long white sheds, and the ridges nobody may walk on. */}
          <rect x="36" y="70" width="112" height="44" rx="3" fill="#eceeed" />
          <path d="M32 70h120l-14 -16H46Z" fill="#cfd4d3" />
          <rect x="172" y="80" width="116" height="34" rx="3" fill="#e4e7e6" />
          <path d="M168 80h124l-14 -14H182Z" fill="#c7cccb" />
          {[40, 84, 128, 172, 216, 260].map((x) => (
            <path key={x} d={`M${x} 150l14 -18l14 18Z`} fill="#f2f4f3" />
          ))}
        </>
      );
    case "the-salt-larder":
      return (
        <>
          <Flats />
          {/* Built high and shuttered tight. */}
          <rect x="86" y="52" width="150" height="72" rx="4" fill="#c9b99b" />
          <path d="M80 52h162l-18 -18H98Z" fill="#a08f74" />
          <rect x="104" y="70" width="42" height="34" rx="2" fill="#8b7a5f" />
          <rect x="176" y="70" width="42" height="34" rx="2" fill="#8b7a5f" />
          <rect x="86" y="118" width="150" height="8" fill="#8b7a5f" />
          <Post x={54} height={30} />
        </>
      );
    case "the-found-counter":
      return (
        <>
          <Flats />
          {/* A long counter of recovered things, each with a paper tag. */}
          <rect x="46" y="98" width="228" height="12" rx="3" fill="#9d8a6d" />
          <rect x="58" y="110" width="8" height="26" fill="#7d6d55" />
          <rect x="254" y="110" width="8" height="26" fill="#7d6d55" />
          <circle cx="88" cy="90" r="8" fill="#b6bfae" />
          <rect x="118" y="82" width="16" height="16" rx="2" fill="#a89b84" />
          <path d="M164 98q10 -16 22 -2l-4 2h-18Z" fill="#8a8073" />
          <rect x="206" y="84" width="12" height="14" rx="2" fill="#c2b394" />
          {[96, 130, 176, 214].map((x) => (
            <rect key={x} x={x} y="100" width="7" height="10" rx="1" fill="#f0ece0" />
          ))}
        </>
      );
    case "the-mending-yard":
      return (
        <>
          <Flats />
          {/* Nets on frames, all mid-repair. */}
          <path d="M60 124V72h84v52" stroke="#7d6d55" strokeWidth="5" fill="none" />
          {[72, 90, 108, 126].map((x) => (
            <path key={x} d={`M${x} 74v46`} stroke="#9aa79b" strokeWidth="2" fill="none" />
          ))}
          {[86, 100, 114].map((y) => (
            <path key={y} d={`M62 ${y}h80`} stroke="#9aa79b" strokeWidth="2" fill="none" />
          ))}
          <path d="M188 124l14 -40h34l14 40Z" fill="#a8987c" />
          <Post x={272} height={36} />
        </>
      );
    case "the-quiet-beacon":
      return (
        <>
          <Flats />
          {/* Still lit, for boats that stopped coming. */}
          <path d="M138 124l10 -74h24l10 74Z" fill="#d7d2c6" />
          <rect x="144" y="44" width="32" height="16" rx="3" fill="#8b8579" />
          <circle cx="160" cy="52" r="7" fill="#f0d89a" />
          <path d="M160 52l-46 -14v28Z" fill="#f0d89a" opacity="0.35" />
          <path d="M160 52l46 -14v28Z" fill="#f0d89a" opacity="0.35" />
          <rect x="130" y="120" width="60" height="8" rx="2" fill="#9a9488" />
        </>
      );
    case "the-deepwater-steps":
      return (
        <>
          <Flats />
          {/* Steps that go down and do not stop. */}
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={104 + i * 6}
              y={92 + i * 10}
              width={112 - i * 12}
              height="10"
              fill={`hsl(196 8% ${72 - i * 6}%)`}
            />
          ))}
          <path d="M0 140q80-8 160 0t160 0v40H0Z" fill="#8fa0a6" />
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
    case "the-mossy-market":
      return (
        <>
          <Backdrop />
          <Tree x={2} scale={0.9} />
          {/* A hollow log fitted with shelves. */}
          <rect x="96" y="86" width="150" height="56" rx="26" fill="#7a6144" />
          <rect x="110" y="96" width="122" height="38" rx="18" fill="#4a3b2a" />
          <rect x="118" y="104" width="106" height="5" rx="2" fill="#8a7154" />
          <rect x="118" y="118" width="106" height="5" rx="2" fill="#8a7154" />
          <circle cx="134" cy="100" r="4" fill="#c78b3c" />
          <circle cx="160" cy="100" r="4" fill="#a8574c" />
          <circle cx="186" cy="114" r="4" fill="#6f9460" />
          <rect x="92" y="138" width="158" height="8" rx="4" fill="#6b5a3f" />
        </>
      );
    case "the-listening-stump":
      return (
        <>
          <Backdrop />
          <Tree x={250} scale={0.85} />
          {/* An enormous old stump, rings and all. */}
          <ellipse cx="150" cy="128" rx="74" ry="22" fill="#6e5a3e" />
          <rect x="76" y="96" width="148" height="34" fill="#7d6647" />
          <ellipse cx="150" cy="96" rx="74" ry="22" fill="#a08560" />
          <ellipse cx="150" cy="96" rx="52" ry="15" fill="#8e7451" />
          <ellipse cx="150" cy="96" rx="30" ry="9" fill="#a08560" />
          <ellipse cx="150" cy="96" rx="12" ry="4" fill="#7d6647" />
        </>
      );
    case "whisperleaf-reading-room":
      return (
        <>
          <Backdrop />
          <Tree x={0} scale={0.8} />
          {/* Shelves of books under a leaf canopy. */}
          <rect x="86" y="74" width="150" height="66" rx="6" fill="#6b543a" />
          <rect x="94" y="82" width="134" height="24" fill="#e8dfc6" />
          <rect x="94" y="110" width="134" height="24" fill="#e8dfc6" />
          <rect x="100" y="84" width="8" height="20" fill="#a8574c" />
          <rect x="112" y="84" width="6" height="20" fill="#3f6b8c" />
          <rect x="122" y="84" width="9" height="20" fill="#6f9460" />
          <rect x="136" y="84" width="7" height="20" fill="#c78b3c" />
          <rect x="100" y="112" width="7" height="20" fill="#6f9460" />
          <rect x="111" y="112" width="9" height="20" fill="#a8574c" />
          <rect x="124" y="112" width="6" height="20" fill="#7a6144" />
        </>
      );
    case "brassbell-pavilion":
      return (
        <>
          <Backdrop />
          {/* An open pavilion with a hanging bell. */}
          <polygon points="160,52 244,96 76,96" fill="#a8574c" />
          <rect x="84" y="96" width="10" height="46" fill="#7a6144" />
          <rect x="226" y="96" width="10" height="46" fill="#7a6144" />
          <rect x="76" y="138" width="168" height="8" rx="4" fill="#6b5a3f" />
          <rect x="158" y="96" width="4" height="14" fill="#6b5a3f" />
          <path d="M148 110 h24 l4 20 h-32 z" fill="#c78b3c" />
          <circle cx="160" cy="134" r="4" fill="#8a6a24" />
        </>
      );
    case "hearth-and-ladle":
      return (
        <>
          <Backdrop />
          <Tree x={252} scale={0.8} />
          {/* A cooking pot over a low fire. */}
          <rect x="104" y="132" width="112" height="8" rx="4" fill="#6b5a3f" />
          <path d="M118 96 h84 l-8 34 h-68 z" fill="#5f5a55" />
          <ellipse cx="160" cy="96" rx="42" ry="10" fill="#7c7671" />
          <ellipse cx="160" cy="96" rx="30" ry="6" fill="#3f3a35" />
          <path d="M196 92 l16 -18" stroke="#7c7671" strokeWidth="4" fill="none" />
          <path
            d="M136 128 q8 -10 16 0 q8 -10 16 0 q8 -10 16 0"
            stroke="#c78b3c"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
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
