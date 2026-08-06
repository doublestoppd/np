import { BackLink } from "./back-link";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional action buttons/links rendered beside (or under, on mobile) the title. */
  actions?: React.ReactNode;
  /** Quiet back navigation rendered above the title. */
  backHref?: string;
  backLabel?: string;
}

/**
 * Every page's title block: optional quiet back-link, display-serif h1,
 * muted description, and a non-competing action slot.
 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
}: PageHeaderProps) {
  return (
    <header className="mb-4">
      {backHref && (
        <div className="-ml-2 mb-1">
          <BackLink href={backHref}>{backLabel}</BackLink>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text">{title}</h1>
          {description && (
            <p className="mt-1 max-w-prose text-sm text-text-muted">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
