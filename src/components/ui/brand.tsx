import Link from "next/link";

interface BrandProps {
  /** Where the lockup links to ("/" in the game, "/sign-in" outside). */
  href?: string;
  /** Optional tagline under the wordmark (auth screens). */
  tagline?: string;
}

/**
 * The one Glimmergrove lockup (placeholder mark + wordmark) shared by the
 * auth shell, public shell, and game navigation.
 */
export function Brand({ href = "/", tagline }: BrandProps) {
  return (
    <div className="text-center">
      <Link
        href={href}
        className="inline-flex items-center gap-2 rounded-control px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true" className="text-2xl">
          🌿
        </span>
        <span className="font-display text-xl font-bold text-text">
          Glimmergrove
        </span>
      </Link>
      {tagline && <p className="mt-1 text-sm text-text-muted">{tagline}</p>}
    </div>
  );
}
