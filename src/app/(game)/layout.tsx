import Link from "next/link";
import { requireUser } from "@/server/auth/session";
import { GameNav } from "@/components/nav/game-nav";
import { CurrencyAmount } from "@/components/ui/currency-amount";

/** Compact wallet chip — balance visible everywhere without dominating. */
function WalletChip({ coins }: { coins: bigint }) {
  return (
    <Link
      href="/profile"
      className="inline-flex min-h-9 items-center rounded-full border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="sr-only">Coin balance: </span>
      <CurrencyAmount amount={coins} compact />
    </Link>
  );
}

export default async function GameLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <div className="min-h-dvh md:pl-56">
      <GameNav wallet={<WalletChip coins={user.coins} />} />
      {/* Mobile utility bar: brand + wallet. The sidebar carries these
          from md up, so this row disappears there. */}
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-3 md:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-control font-display text-base font-bold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">🌿</span>
          Glimmergrove
        </Link>
        <WalletChip coins={user.coins} />
      </div>
      {/* Bottom padding derives from the nav-clearance token (bottom nav
          height + safe-area inset) — never a hard-coded guess. */}
      <main
        id="main"
        className="mx-auto w-full max-w-3xl px-4 pb-nav-clearance pt-4 md:pb-10 md:pt-6"
      >
        {children}
      </main>
    </div>
  );
}
