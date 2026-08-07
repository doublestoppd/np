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

import { PLACE_ICON_KEYS } from "./sourced-icons";
import { SourcedArt } from "./sourced-art";

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

function Tortoise() {
  return (
    <Frame>
      {/* Shell */}
      <path d="M28 88q32 -42 64 0z" fill="#8a7a4e" />
      <path d="M28 88q32 -42 64 0" fill="none" stroke="#6d6039" strokeWidth="3" />
      {[46, 60, 74].map((x) => (
        <path key={x} d={`M${x} 88V64`} stroke="#6d6039" strokeWidth="2.5" />
      ))}
      {/* Head, in no hurry */}
      <ellipse cx="98" cy="80" rx="13" ry="10" fill="#9db07c" />
      <circle cx="103" cy="78" r="2.2" fill="#33402a" />
      <path d="M40 88v12M78 88v12" stroke="#9db07c" strokeWidth="6" strokeLinecap="round" />
    </Frame>
  );
}

function Heron() {
  return (
    <Frame>
      {/* Legs, doing most of the work */}
      <path d="M56 108V74M70 108V78" stroke="#b9a86a" strokeWidth="3" strokeLinecap="round" />
      {/* Body */}
      <ellipse cx="62" cy="66" rx="22" ry="15" fill="#c6ccd0" />
      {/* Neck and head, patient */}
      <path d="M72 58q10 -18 4 -26" stroke="#c6ccd0" strokeWidth="8" fill="none" strokeLinecap="round" />
      <ellipse cx="76" cy="30" rx="10" ry="8" fill="#d5dade" />
      <circle cx="80" cy="28" r="2.2" fill="#33402a" />
      <path d="M86 30l16 4l-16 4z" fill="#c9a13f" />
      <path d="M70 24l10 -6" stroke="#9aa2a7" strokeWidth="2.5" strokeLinecap="round" />
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
  "keeper-tortoise": Tortoise,
  "keeper-heron": Heron,
};

export function KeeperArt({ artKey, label, className = "" }: KeeperArtProps) {
  const decorative = label === "";

  // A sourced portrait where one exists. The hand-drawn animals below read
  // as four different draughtsmen's work — the heron is mostly legs, the
  // hedgehog mostly spines — and beside ninety item silhouettes in one
  // style they were the odd panel out. The frame stays ours: it is what
  // makes a keeper a portrait rather than another icon in a list.
  if (PLACE_ICON_KEYS.has(artKey)) {
    return (
      <div
        className={`relative h-full w-full ${className}`.trim()}
        role={decorative ? "presentation" : "img"}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative || undefined}
      >
        <svg viewBox="0 0 120 120" className="absolute inset-0 h-full w-full">
          <rect width="120" height="120" rx="8" fill="#efe7d6" />
          <circle cx="60" cy="120" r="52" fill="#e2dac8" />
        </svg>
        <SourcedArt
          set="places"
          artKey={artKey}
          ink="#5b4a35"
          label=""
          className="absolute inset-[14%]"
        />
      </div>
    );
  }

  const Scene = KEEPERS[artKey] ?? Anonymous;
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
