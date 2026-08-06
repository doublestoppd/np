import { Badge, type BadgeTone } from "./badge";

/**
 * The shared player-facing status vocabulary. Every availability or
 * completion state across dailies, shops, and listings maps onto one of
 * these — internal enum names never reach the player directly, and every
 * status pairs an icon with its label so color is never the only signal.
 */
export type PlayerStatus =
  | "AVAILABLE"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "CLAIMED"
  | "SOLD_OUT"
  | "UNAVAILABLE";

const PRESENTATION: Record<
  PlayerStatus,
  { label: string; icon: string; tone: BadgeTone }
> = {
  AVAILABLE: { label: "Available", icon: "✦", tone: "accent" },
  IN_PROGRESS: { label: "In progress", icon: "…", tone: "warning" },
  COMPLETED: { label: "Completed", icon: "✓", tone: "success" },
  FAILED: { label: "Finished", icon: "•", tone: "neutral" },
  CLAIMED: { label: "Claimed", icon: "✓", tone: "success" },
  SOLD_OUT: { label: "Sold out", icon: "•", tone: "neutral" },
  UNAVAILABLE: { label: "Unavailable", icon: "•", tone: "neutral" },
};

interface StatusBadgeProps {
  status: PlayerStatus;
  /** Domain-specific wording override; the icon and tone stay shared. */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const preset = PRESENTATION[status];
  return (
    <Badge tone={preset.tone} className={className}>
      <span aria-hidden="true">{preset.icon}</span>
      {label ?? preset.label}
    </Badge>
  );
}
