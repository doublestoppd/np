import Link from "next/link";
import type { UserRole } from "@prisma/client";
import { isAdmin } from "@/lib/roles";
import { RandomEventWatcher } from "@/components/events/random-event-watcher";
import { GameNav } from "./game-nav";
import { SiteFooter } from "./site-footer";
import { WalletChip } from "./wallet-chip";

/**
 * The authenticated game shell: sidebar from lg (1024 px) up, bottom navigation on
 * mobile, and a mobile utility bar carrying the brand and wallet. Shared by
 * the (game) route group and by public pages viewed while signed in, so a
 * player never loses navigation mid-flow.
 *
 * Clearance for the bottom bar derives from the nav-clearance token (nav
 * height plus the safe-area inset) and belongs to whatever is last in the
 * flow — the footer, not `<main>`. Routes never hard-code that value.
 *
 * The shell also hosts the random-event watcher, so every authenticated
 * page view is a candidate exactly once, without any route opting in. The
 * server decides which routes are eligible.
 */
export function GameShell({
  coins,
  role = "PLAYER",
  children,
}: {
  coins: bigint;
  /** Decides which privileged links appear. Pages re-check for themselves. */
  role?: UserRole;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:pl-56">
      <GameNav wallet={<WalletChip coins={coins} />} role={role} />
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-3 lg:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-control font-display text-base font-bold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">🌿</span>
          Glimmergrove
        </Link>
        <span className="flex items-center gap-2">
          {isAdmin(role) && (
            <Link
              href="/admin"
              className="rounded-control border border-border px-2 py-1 text-xs font-medium text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Debug
            </Link>
          )}
          <WalletChip coins={coins} />
        </span>
      </div>
      {/* tabindex="-1" is what makes "Skip to content" actually move the
          reading cursor. Without it the fragment jump changes the scroll
          position and nothing else, so a screen-reader user still walks
          through eight stops of header and navigation. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-3xl px-4 pb-4 pt-4 outline-none lg:pb-6 lg:pt-6"
      >
        {children}
      </main>
      <SiteFooter clearsBottomNav />
      <RandomEventWatcher />
    </div>
  );
}
