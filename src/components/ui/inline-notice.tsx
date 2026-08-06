export type NoticeTone = "info" | "success" | "warning" | "error";

const TONES: Record<
  NoticeTone,
  { box: string; icon: string; role?: "alert" | "status" }
> = {
  info: {
    box: "border-border bg-surface text-text",
    icon: "ℹ",
  },
  success: {
    box: "border-success/25 bg-success-soft text-success",
    icon: "✓",
    role: "status",
  },
  warning: {
    box: "border-warning/25 bg-warning-soft text-warning",
    icon: "⚠",
    role: "status",
  },
  error: {
    box: "border-danger/25 bg-danger-soft text-danger",
    icon: "⚠",
    role: "alert",
  },
};

interface InlineNoticeProps {
  tone?: NoticeTone;
  children: React.ReactNode;
  className?: string;
  /** Suppress the landmark role for purely static informational copy. */
  plain?: boolean;
}

/**
 * Persistent inline feedback — conflicts, results, warnings, guidance.
 * Notices stay on the page (never disappearing toasts) so commerce and
 * reward outcomes remain readable; each tone pairs an icon with the copy.
 */
export function InlineNotice({
  tone = "info",
  children,
  className = "",
  plain = false,
}: InlineNoticeProps) {
  const preset = TONES[tone];
  return (
    <div
      role={plain ? undefined : preset.role}
      className={`flex items-start gap-2 rounded-control border px-4 py-3 text-sm ${preset.box} ${className}`.trim()}
    >
      <span aria-hidden="true" className="mt-px shrink-0 font-semibold">
        {preset.icon}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
