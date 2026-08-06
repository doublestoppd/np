interface SectionHeadingProps {
  children: React.ReactNode;
  /** id for aria-labelledby wiring on the enclosing section. */
  id?: string;
  /** Muted single-line context under the heading. */
  description?: string;
  /** Optional action (LinkButton/Button) aligned with the heading. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * The standard section title inside a page: display serif, one visual
 * level below the page title. Routes must use this rather than hand-roll
 * h2 styling so hierarchy stays consistent everywhere.
 */
export function SectionHeading({
  children,
  id,
  description,
  action,
  className = "",
}: SectionHeadingProps) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 ${className}`.trim()}
    >
      <div className="min-w-0">
        <h2 id={id} className="font-display text-lg font-semibold text-text">
          {children}
        </h2>
        {description && (
          <p className="mt-0.5 text-sm text-text-muted">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
