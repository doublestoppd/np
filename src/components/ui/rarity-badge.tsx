import type { Rarity } from "@prisma/client";
import { Badge, type BadgeTone } from "./badge";

const RARITY_PRESENTATION: Record<Rarity, { label: string; tone: BadgeTone }> = {
  COMMON: { label: "Common", tone: "neutral" },
  UNCOMMON: { label: "Uncommon", tone: "success" },
  RARE: { label: "Rare", tone: "accent" },
  ULTRA_RARE: { label: "Ultra-rare", tone: "warning" },
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  const { label, tone } = RARITY_PRESENTATION[rarity];
  return <Badge tone={tone}>{label}</Badge>;
}
