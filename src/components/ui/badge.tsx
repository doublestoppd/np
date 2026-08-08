import { TINT_BADGE, type Tint } from "@/lib/content-tint";

/**
 * Tones say what a badge *is for*. The five semantic ones carry state —
 * available, done, careful, wrong — and the six tints carry content, which
 * is why they are separate lists rather than one big palette: when rarity
 * borrowed `accent` from status, a "Rare" chip and an "Available" chip were
 * the same green, and colour on this page taught players nothing.
 */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-background text-text-muted border-border",
  accent: "bg-accent-soft text-accent-strong border-accent/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
};

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  /** Content hue. Takes precedence over `tone` when both are given. */
  tint?: Tint;
  className?: string;
}

export function Badge({
  children,
  tone = "neutral",
  tint,
  className = "",
}: BadgeProps) {
  const palette = tint ? TINT_BADGE[tint] : TONES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${palette} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
