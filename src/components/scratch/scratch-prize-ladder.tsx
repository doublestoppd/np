import { formatCoins } from "@/lib/money";
import type { ScratchPrizeRow } from "@/server/modules/scratch/queries";

/**
 * What is on a chit, richest first — and the pool it feeds (ADR-48).
 *
 * The ladder, not the odds. Which outcomes exist is a fair thing to know
 * before walking to the stall; how often they land is what the scraping is
 * for. The losing outcome is not listed, because a card that advertises
 * "nothing" as a prize is being coy — the blank announces itself honestly
 * when three marks fail to match.
 */
export function ScratchPrizeLadder({
  priceJson,
  prizes,
  jackpotJson,
  lastWonBy,
}: {
  priceJson: string;
  prizes: ScratchPrizeRow[];
  jackpotJson: string;
  lastWonBy: string | null;
}) {
  return (
    <>
      <div className="mt-2 rounded-control border border-accent/40 bg-accent/5 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-text-muted">
          The Pans
        </p>
        <p className="font-display text-3xl font-bold tabular-nums text-text">
          {formatCoins(BigInt(jackpotJson))}
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Three of ✹ takes the lot. Every chit scraped anywhere in the world
          adds to it.
          {lastWonBy ? ` Last taken by ${lastWonBy}.` : " Nobody has had it yet."}
        </p>
      </div>

      <p className="mt-3 max-w-prose text-sm text-text-muted">
        Three marks under the salt. Match all three and the chit pays what
        that mark is worth. Most of them do not — that is what makes the
        ones that do worth {formatCoins(BigInt(priceJson))} coins.
      </p>

      <h3 className="mt-4 text-sm font-medium text-text">
        What&apos;s on this one
      </h3>
      <ul className="mt-2 space-y-1.5">
        {prizes.map((prize) => (
          <li
            key={prize.label}
            className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-border/50 pb-1.5 text-sm"
          >
            <span className="text-text">{prize.label}</span>
            <span className="text-text-muted">
              {prize.kind === "JACKPOT"
                ? "the pans, in full"
                : prize.kind === "COINS"
                  ? `${formatCoins(BigInt(prize.coins))} coins`
                  : `${prize.quantity > 1 ? `${prize.quantity} × ` : ""}${prize.itemName}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
