interface EmptyStateProps {
  title: string;
  description?: string;
  /** Decorative emoji or small illustration. */
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /**
   * Heading level. Defaults to h2 for a page-level empty state; pass "h3"
   * when the empty state sits inside an h2-titled section so screen-reader
   * heading navigation reflects the real nesting.
   */
  headingAs?: "h2" | "h3";
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  headingAs: Heading = "h2",
}: EmptyStateProps) {
  return (
    <div className="rounded-surface border border-dashed border-border-strong bg-surface px-4 py-10 text-center">
      {icon && (
        <div aria-hidden="true" className="text-4xl">
          {icon}
        </div>
      )}
      <Heading className="mt-3 font-display text-lg font-semibold text-text">
        {title}
      </Heading>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
