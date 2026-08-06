import Link from "next/link";
import { GameNav } from "./game-nav";
import { WalletChip } from "./wallet-chip";

/**
 * The authenticated game shell: sidebar from md up, bottom navigation on
 * mobile, and a mobile utility bar carrying the brand and wallet. Shared by
 * the (game) route group and by public pages viewed while signed in, so a
 * player never loses navigation mid-flow.
 *
 * Bottom padding derives from the nav-clearance token (nav height plus the
 * safe-area inset) — routes never hard-code that value.
 */
export function GameShell({
  coins,
  children,
}: {
  coins: bigint;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh lg:pl-56">
      <GameNav wallet={<WalletChip coins={coins} />} />
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-3 lg:hidden">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-control font-display text-base font-bold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true">🌿</span>
          Glimmergrove
        </Link>
        <WalletChip coins={coins} />
      </div>
      <main
        id="main"
        className="mx-auto w-full max-w-3xl px-4 pb-nav-clearance pt-4 lg:pb-10 lg:pt-6"
      >
        {children}
      </main>
    </div>
  );
}
