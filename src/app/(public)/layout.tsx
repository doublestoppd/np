import { getCurrentUser } from "@/server/auth/session";
import { GameShell } from "@/components/nav/game-shell";
import { Brand } from "@/components/ui/brand";

/**
 * Chrome for pages viewable without signing in. A signed-out visitor gets
 * minimal chrome; a signed-in player keeps the full game shell — these
 * pages (player storefronts, public profiles) sit in the middle of buying
 * flows, so losing navigation and the wallet mid-purchase would strand
 * them.
 */
export default async function PublicLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const viewer = await getCurrentUser();

  if (viewer) {
    return <GameShell coins={viewer.coins}>{children}</GameShell>;
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-3xl items-center px-4 py-3">
          <Brand href="/" />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl px-4 py-6 outline-none"
      >
        {children}
      </main>
    </div>
  );
}
