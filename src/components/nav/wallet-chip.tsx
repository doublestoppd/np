import Link from "next/link";
import { CurrencyAmount } from "@/components/ui/currency-amount";

/**
 * Compact wallet chip for the app shell: the balance stays visible on
 * every surface where a player might spend it, without dominating a page.
 */
export function WalletChip({ coins }: { coins: bigint }) {
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
