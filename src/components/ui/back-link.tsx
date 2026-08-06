import Link from "next/link";

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
}

/**
 * The quiet, predictable "Back to …" affordance. Visually subdued so it
 * never competes with a page's primary action, with a generous tap area.
 */
export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-accent-soft hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}
