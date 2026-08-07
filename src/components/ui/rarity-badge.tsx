import type { Rarity } from "@prisma/client";

/**
 * Rarity, on its own colour scale.
 *
 * It used to borrow the status tones — `accent` for Rare, `success` for
 * Uncommon — so a rarity chip and an availability chip were the same green
 * and neither meant anything by its colour. Its own scale costs four
 * tokens and makes both legible.
 *
 * The scale is deliberately not a heat ramp from dull to gold. Rarity here
 * describes how often a thing turns up, not how good it is or how well the
 * player is doing, and a ladder that visibly brightens toward "ultra"
 * makes a satchel look like a scoreboard (docs/design-philosophy.md). The
 * word is always present, so the colour never carries it alone.
 */
const RARITY_PRESENTATION: Record<Rarity, { label: string; palette: string }> = {
  COMMON: {
    label: "Common",
    palette:
      "bg-rarity-common-soft text-rarity-common border-rarity-common/20",
  },
  UNCOMMON: {
    label: "Uncommon",
    palette:
      "bg-rarity-uncommon-soft text-rarity-uncommon border-rarity-uncommon/20",
  },
  RARE: {
    label: "Rare",
    palette: "bg-rarity-rare-soft text-rarity-rare border-rarity-rare/20",
  },
  ULTRA_RARE: {
    label: "Ultra-rare",
    palette: "bg-rarity-ultra-soft text-rarity-ultra border-rarity-ultra/20",
  },
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const { label, palette } = RARITY_PRESENTATION[rarity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${palette}`}
    >
      {label}
    </span>
  );
}
