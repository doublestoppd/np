import { Brand } from "@/components/ui/brand";

/** Minimal chrome for pages viewable without signing in. */
export default function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center px-4 py-3">
          <Brand href="/" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
