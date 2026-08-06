import Link from "next/link";

/** Minimal chrome for pages viewable without signing in. */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true" className="text-xl">
              🌿
            </span>
            <span className="font-display text-lg font-bold text-text">
              Glimmergrove
            </span>
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
