import { formatCoins } from "@/lib/money";

interface CurrencyAmountProps {
  amount: bigint;
  /** Signed delta presentation (+/− prefix and success/danger color). */
  delta?: boolean;
  /** Hide the trailing word "coins" where space is tight (tables, chips). */
  compact?: boolean;
  className?: string;
}

/**
 * The single way a coin amount reaches the screen: bigint in,
 * grouped digits out, coin glyph paired with a textual unit so the
 * meaning never relies on the emoji alone. Deltas color-code but always
 * keep their explicit +/− sign.
 */
export function CurrencyAmount({
  amount,
  delta = false,
  compact = false,
  className = "",
}: CurrencyAmountProps) {
  const negative = amount < 0n;
  const magnitude = negative ? -amount : amount;
  const sign = delta ? (negative ? "−" : "+") : "";
  const tone = delta ? (negative ? "text-danger" : "text-success") : "";
  return (
    <span
      className={`inline-flex items-baseline gap-1 tabular-nums ${tone} ${className}`.trim()}
    >
      <span aria-hidden="true">🪙</span>
      <span>
        {sign}
        {formatCoins(magnitude)}
        {compact ? null : <span> coins</span>}
      </span>
    </span>
  );
}
