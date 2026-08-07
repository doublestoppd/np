/**
 * Placeholder shopkeeper artwork: simple original flat portraits keyed by
 * artKey. Replaced later by `public/art/keepers/<artKey>.webp`
 * (docs/art-direction.md). Deliberately provisional — no final motif.
 *
 * A keeper is static presentation content, not a character system: this
 * draws a portrait and nothing else. There is no dialogue, schedule,
 * friendship, or movement behind it, and none should be added
 * (CLAUDE.md's world model).
 */

interface KeeperArtProps {
  artKey: string;
  /** Accessible name, e.g. "The Mossy Market's keeper". Empty = decorative. */
  label: string;
  className?: string;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <rect width="120" height="120" rx="8" fill="#efe7d6" />
      <circle cx="60" cy="120" r="52" fill="#e2dac8" />
      {children}
    </>
  );
}

function Hedgehog() {
  return (
    <Frame>
      {/* Spines */}
      <path
        d="M22 82c0-24 17-44 38-44s38 20 38 44z"
        fill="#7a6144"
      />
      {[32, 44, 56, 68, 80].map((x, index) => (
        <path
          key={x}
          d={`M${x} ${72 - (index % 2) * 8}l6 -18l6 18z`}
          fill="#5d492f"
        />
      ))}
      {/* Face */}
      <ellipse cx="60" cy="86" rx="22" ry="17" fill="#d7c3a3" />
      <circle cx="52" cy="83" r="2.6" fill="#3a3227" />
      <circle cx="68" cy="83" r="2.6" fill="#3a3227" />
      <ellipse cx="60" cy="92" rx="4" ry="3" fill="#8a6b4f" />
    </Frame>
  );
}

function StickInsect() {
  return (
    <Frame>
      {/* Limbs */}
      {[
        "M34 96l14 -22l-10 -18",
        "M86 96l-14 -22l10 -18",
        "M40 62l16 -8",
        "M80 62l-16 -8",
      ].map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="#6f8557"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      {/* Body */}
      <rect x="53" y="46" width="14" height="52" rx="7" fill="#88a069" />
      {/* Head */}
      <ellipse cx="60" cy="42" rx="12" ry="10" fill="#9db47c" />
      <circle cx="55" cy="40" r="2.2" fill="#33402a" />
      <circle cx="65" cy="40" r="2.2" fill="#33402a" />
      <path
        d="M52 33l-8 -10M68 33l8 -10"
        stroke="#6f8557"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Frame>
  );
}

/** Anyone the content has not drawn yet: a plain, friendly silhouette. */
function Anonymous() {
  return (
    <Frame>
      <circle cx="60" cy="52" r="22" fill="#c3ac8a" />
      <path d="M24 112c0-22 16-36 36-36s36 14 36 36z" fill="#a98f6b" />
    </Frame>
  );
}

const KEEPERS: Record<string, () => React.ReactElement> = {
  "keeper-hedgehog": Hedgehog,
  "keeper-stick-insect": StickInsect,
};

export function KeeperArt({ artKey, label, className = "" }: KeeperArtProps) {
  const Scene = KEEPERS[artKey] ?? Anonymous;
  const decorative = label === "";
  return (
    <svg
      viewBox="0 0 120 120"
      className={`h-full w-full ${className}`.trim()}
      role={decorative ? "presentation" : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
    >
      <Scene />
    </svg>
  );
}
