/**
 * A painted ground, composed deterministically from a place's key.
 *
 * Every Dapplewood location used to share one identical backdrop and every
 * Saltmere one another — same trees, same sun, same hills — so sixteen
 * places were really two pictures with the subject swapped. This builds a
 * distinct ground for each: the region still decides the whole palette and
 * vocabulary (a wood is green and full of trees, the flats are grey and
 * full of standing water), but the light, the horizon, the hills, and
 * where things stand are all seeded from the key, so no two places look
 * the same and the same place always looks like itself.
 *
 * It stays a placeholder (docs/art-direction.md): flat, few shapes, and
 * plainly not the painted target. The centre-lower band is kept clear of
 * scatter so the sourced subject that stands there still reads.
 */

export type Terrain = "wood" | "flats" | "fell";

/** A tiny seeded PRNG so a key always paints the same ground. */
function makeRng(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // mulberry32
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sky {
  top: string;
  bottom: string;
  /** Sun/moon disc colour. */
  disc: string;
}

interface Palette {
  sky: Sky[];
  /** Two hill/band layers, back then front. */
  land: [string, string][];
  /** Extra detail colour: canopy set for wood, water for flats. */
  detail: string[];
  trunk: string;
}

/**
 * Four moods per region, so a location reads as morning, or golden, or
 * overcast — the cheapest way to make sixteen grounds feel like sixteen
 * times of day rather than one repeated twice.
 */
const PALETTES: Record<Terrain, Palette> = {
  wood: {
    sky: [
      { top: "#e4eeda", bottom: "#cfe2c4", disc: "#f4edd0" },
      { top: "#f1e7c9", bottom: "#dce7c1", disc: "#f7edca" },
      { top: "#d3e2d0", bottom: "#bfd5ba", disc: "#e7efd8" },
      { top: "#dde5da", bottom: "#c9d6c2", disc: "#eef1e6" },
    ],
    land: [
      ["#b9cfa6", "#a3bf90"],
      ["#b3c795", "#9bb583"],
      ["#9dbb8c", "#85a674"],
      ["#aec19d", "#98ad85"],
    ],
    detail: ["#5d8050", "#6f9460", "#547548", "#4e7346"],
    trunk: "#6e5a3e",
  },
  // High country: cold thin light, hard rock, and standing water that is
  // dark rather than silvered. Deliberately the coldest of the three —
  // Tarnreach borrowing the flats' palette would have made a third region
  // that looked like a second Saltmere.
  fell: {
    sky: [
      { top: "#dfe7f0", bottom: "#c4d2e2", disc: "#f0f4f8" },
      { top: "#e8e6ef", bottom: "#cdcedf", disc: "#f2eef4" },
      { top: "#cfdae6", bottom: "#b4c3d4", disc: "#e2ebf2" },
      { top: "#d6dce3", bottom: "#bcc5ce", disc: "#e9edf1" },
    ],
    land: [
      ["#8f9cab", "#76889b"],
      ["#94969f", "#7b8190"],
      ["#7f8f9e", "#68798c"],
      ["#8b939c", "#727d89"],
    ],
    detail: ["#3f5568", "#4a637a", "#37485a", "#44576b"],
    trunk: "#5a5f66",
  },
  flats: {
    sky: [
      { top: "#e6ebec", bottom: "#d4dcdd", disc: "#eaeeef" },
      { top: "#ece7e1", bottom: "#d9dcdc", disc: "#f0e4e0" },
      { top: "#dde3e2", bottom: "#ccd3d2", disc: "#e4ebea" },
      { top: "#d9dddd", bottom: "#c7cdcd", disc: "#e6eaea" },
    ],
    land: [
      ["#b9c0c2", "#a9b2b4"],
      ["#b6bcbd", "#a5aeb0"],
      ["#b0b7b0", "#9ea79f"],
      ["#b3b8b8", "#a2a9a9"],
    ],
    detail: ["#c3ced1", "#cdd6d8", "#bcc7c9", "#c8d0d2"],
    trunk: "#6f6a63",
  },
};

function pick<T>(rng: () => number, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length) % xs.length] as T;
}

function range(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/** One conifer/broadleaf clump for the wood. */
function tree(
  key: string,
  x: number,
  y: number,
  scale: number,
  canopy: string[],
  trunk: string,
) {
  return (
    <g key={key} transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-3" y="-2" width="6" height="24" rx="3" fill={trunk} />
      <circle cx="0" cy="-16" r="20" fill={canopy[0]} />
      <circle cx="-13" cy="-6" r="13" fill={canopy[1]} />
      <circle cx="14" cy="-6" r="12" fill={canopy[2]} />
    </g>
  );
}

/** A weathered post — the flats are full of them and few explain why. */
function post(key: string, x: number, top: number, colour: string) {
  return (
    <g key={key}>
      <rect x={x} y={top} width="5" height={124 - top} rx="2" fill={colour} />
      <rect x={x - 3} y={top} width="11" height="4" rx="2" fill="#5d584f" />
    </g>
  );
}

/** A stack of flat stones — the fells are full of them. */
function cairn(key: string, x: number, base: number, colour: string) {
  return (
    <g key={key} fill={colour}>
      <ellipse cx={x} cy={base} rx="11" ry="3.5" />
      <ellipse cx={x} cy={base - 7} rx="8.5" ry="3" />
      <ellipse cx={x} cy={base - 13} rx="6" ry="2.5" />
      <ellipse cx={x} cy={base - 18} rx="3.5" ry="2" />
    </g>
  );
}

/** A tuft of marsh reeds. */
function reeds(key: string, x: number, colour: string) {
  return (
    <g key={key} stroke={colour} strokeWidth="2.5" strokeLinecap="round">
      <path d={`M${x} 124 L${x - 4} 108`} />
      <path d={`M${x + 3} 124 L${x + 5} 106`} />
      <path d={`M${x + 6} 124 L${x + 10} 110`} />
    </g>
  );
}

/**
 * Builds the ground for one place. Returns the SVG children for a
 * `0 0 320 180` frame; the caller adds the subject and its shadow on top.
 */
export function LocationScene({
  artKey,
  terrain,
}: {
  artKey: string;
  terrain: Terrain;
}) {
  const rng = makeRng(artKey);
  const palette = PALETTES[terrain];
  const mood = Math.floor(rng() * 4);
  const sky = palette.sky[mood] as Sky;
  const [landBack, landFront] = palette.land[mood] as [string, string];
  const horizon = range(rng, 86, 104);
  const discX = range(rng, 40, 280);
  const discY = range(rng, 30, 58);
  const discR = range(rng, 13, 20);
  const gid = `sky-${artKey}`;

  const nodes: React.ReactNode[] = [];

  if (terrain === "wood") {
    // Two rolling hills, then a scatter of trees kept to the wings so the
    // subject in the middle stays clear.
    nodes.push(
      <ellipse
        key="hill-back"
        cx={range(rng, 60, 160)}
        cy={horizon + 60}
        rx={range(rng, 150, 210)}
        ry={range(rng, 58, 80)}
        fill={landBack}
      />,
      <ellipse
        key="hill-front"
        cx={range(rng, 180, 280)}
        cy={horizon + 74}
        rx={range(rng, 160, 220)}
        ry={range(rng, 66, 92)}
        fill={landFront}
      />,
    );
    const left = Math.floor(range(rng, 1, 3));
    const right = Math.floor(range(rng, 1, 3));
    for (let i = 0; i < left; i++) {
      nodes.push(
        tree(
          `tl-${i}`,
          range(rng, -8, 60),
          range(rng, horizon + 14, horizon + 34),
          range(rng, 0.8, 1.15),
          palette.detail,
          palette.trunk,
        ),
      );
    }
    for (let i = 0; i < right; i++) {
      nodes.push(
        tree(
          `tr-${i}`,
          range(rng, 262, 328),
          range(rng, horizon + 14, horizon + 34),
          range(rng, 0.8, 1.15),
          palette.detail,
          palette.trunk,
        ),
      );
    }
  } else if (terrain === "fell") {
    // Angular peaks rather than rolling hills, one dark tarn low in the
    // frame, and cairns kept to the wings so the subject stays clear.
    const peak = (key: string, x: number, height: number, colour: string) => (
      <path
        key={key}
        d={`M${x - height * 0.9} ${horizon + 40} L${x} ${horizon + 40 - height} L${x + height * 0.9} ${horizon + 40} Z`}
        fill={colour}
      />
    );
    nodes.push(
      <rect key="band" y={horizon} width="320" height={180 - horizon} fill={landBack} />,
      peak("peak-a", range(rng, 30, 120), range(rng, 46, 74), landBack),
      peak("peak-b", range(rng, 150, 250), range(rng, 54, 88), landBack),
      peak("peak-c", range(rng, 90, 230), range(rng, 34, 56), landFront),
      <path
        key="fore"
        d={`M0 ${horizon + 30} L${range(rng, 90, 150)} ${horizon + 20} L320 ${horizon + 34} L320 180 L0 180 Z`}
        fill={landFront}
      />,
    );
    nodes.push(
      <ellipse
        key="tarn"
        cx={range(rng, 110, 210)}
        cy={range(rng, 146, 166)}
        rx={range(rng, 62, 104)}
        ry={range(rng, 9, 15)}
        fill={pick(rng, palette.detail)}
      />,
    );
    const cairns = Math.floor(range(rng, 1, 3));
    for (let i = 0; i < cairns; i++) {
      const x = i % 2 === 0 ? range(rng, 12, 52) : range(rng, 270, 306);
      nodes.push(cairn(`cairn-${i}`, x, range(rng, horizon + 22, horizon + 40), palette.trunk));
    }
  } else {
    // A flat horizon band, standing water left behind, a few posts and
    // reeds. Water and posts may sit anywhere — they are thin or low and
    // do not crowd the subject.
    nodes.push(
      <rect key="band" y={horizon} width="320" height={180 - horizon} fill={landBack} />,
      <path
        key="fore"
        d={`M0 ${horizon + 12} Q80 ${horizon + 4} 160 ${horizon + 12} T320 ${horizon + 10} L320 180 L0 180 Z`}
        fill={landFront}
      />,
    );
    const pools = Math.floor(range(rng, 2, 4));
    for (let i = 0; i < pools; i++) {
      nodes.push(
        <ellipse
          key={`pool-${i}`}
          cx={range(rng, 40, 280)}
          cy={range(rng, horizon + 40, 168)}
          rx={range(rng, 46, 92)}
          ry={range(rng, 8, 14)}
          fill={pick(rng, palette.detail)}
        />,
      );
    }
    const posts = Math.floor(range(rng, 2, 4));
    for (let i = 0; i < posts; i++) {
      const x = i % 2 === 0 ? range(rng, 8, 60) : range(rng, 262, 306);
      nodes.push(post(`post-${i}`, x, range(rng, horizon - 34, horizon - 10), palette.trunk));
    }
    if (rng() > 0.4) {
      reedsHelper(nodes, rng, palette.detail[1] as string);
    }
  }

  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sky.top} />
          <stop offset="100%" stopColor={sky.bottom} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#${gid})`} />
      <circle cx={discX} cy={discY} r={discR} fill={sky.disc} />
      {nodes}
    </>
  );
}

/** Places one or two reed tufts on the wings. */
function reedsHelper(
  nodes: React.ReactNode[],
  rng: () => number,
  colour: string,
) {
  nodes.push(reeds("reed-l", range(rng, 12, 44), colour));
  if (rng() > 0.5) nodes.push(reeds("reed-r", range(rng, 276, 304), colour));
}
