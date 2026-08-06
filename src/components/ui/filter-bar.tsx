interface FilterBarProps {
  /** GET target route ("/market", "/inventory"). */
  action: string;
  children: React.ReactNode;
}

/**
 * The shared catalog filter chrome: a GET form laid out as a single
 * column on mobile and a search-plus-controls row from sm up. Used by
 * every list page with filters so the treatment never drifts.
 */
export function FilterBar({ action, children }: FilterBarProps) {
  return (
    <form
      method="get"
      action={action}
      className="mb-4 grid grid-cols-1 gap-3 rounded-surface border border-border bg-surface p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
    >
      {children}
    </form>
  );
}
