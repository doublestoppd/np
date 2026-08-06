interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional action buttons/links rendered beside (or under, on mobile) the title. */
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold text-text">{title}</h1>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
