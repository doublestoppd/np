import Link from "next/link";

/**
 * Previous / next, and nothing else.
 *
 * No numbered pages: at 360px a row of numbers is either too small to
 * tap or wraps onto three lines, and in a forum this size nobody is
 * jumping to page 7. Rendered as nothing at all when there is one page,
 * so a quiet board is not decorated with dead controls.
 */
export function Pager({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) {
    return null;
  }
  const link =
    "min-h-11 inline-flex items-center rounded-control border border-border px-3 text-sm text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <nav
      aria-label="Pages"
      className="mt-4 flex items-center justify-between gap-2"
    >
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={link} rel="prev">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <p className="text-xs text-text-muted" aria-current="page">
        Page {page} of {pageCount}
      </p>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={link} rel="next">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
