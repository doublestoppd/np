interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  /** Token-driven fill class, e.g. "bg-stat-hunger". */
  colorClass: string;
}

/**
 * Accessible stat meter: the numeric value is visible text, and the bar
 * exposes the WAI-ARIA meter role for assistive technology.
 */
export function StatBar({ label, value, max = 100, colorClass }: StatBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-text">{label}</span>
        <span className="tabular-nums text-text-muted">
          {value}/{max}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="mt-1 h-3 overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
