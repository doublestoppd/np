interface EmptyStateProps {
  title: string;
  description?: string;
  /** Decorative emoji or small illustration. */
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="rounded-surface border border-dashed border-border-strong bg-surface px-4 py-10 text-center">
      {icon && (
        <div aria-hidden="true" className="text-4xl">
          {icon}
        </div>
      )}
      <h2 className="mt-3 font-display text-lg font-semibold text-text">
        {title}
      </h2>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
