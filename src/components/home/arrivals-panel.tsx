import type { ArrivalsView } from "@/server/modules/arrivals/queries";
import { coinsFromJSON } from "@/lib/money";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";

const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/** "yesterday", "3 days ago" — never an exact timestamp for a greeting. */
function describeGap(since: Date, now: Date): string {
  const hours = Math.round((now.getTime() - since.getTime()) / 3_600_000);
  if (hours < 24) {
    return RELATIVE.format(-Math.max(1, hours), "hour");
  }
  return RELATIVE.format(-Math.round(hours / 24), "day");
}

/**
 * "While you were away."
 *
 * Renders nothing when there is nothing to say — no empty state, no
 * "0 new", no badge. It reports only what happened in the player's
 * favour, and never what they missed.
 */
export function ArrivalsPanel({
  arrivals,
  now = new Date(),
}: {
  arrivals: ArrivalsView | null;
  now?: Date;
}) {
  if (!arrivals?.sales) {
    return null;
  }
  const proceeds = coinsFromJSON(arrivals.sales.proceeds);
  const things =
    arrivals.sales.count === 1 ? "something" : `${arrivals.sales.count} things`;

  return (
    <Surface as="section" aria-labelledby="arrivals-heading" className="mb-4">
      <h2 id="arrivals-heading" className="font-display text-base font-semibold">
        While you were away
      </h2>
      <p className="mt-1 text-sm text-text">
        Your shop sold {things} since {describeGap(arrivals.since, now)}
        {proceeds > 0n ? (
          <>
            , and <CurrencyAmount amount={proceeds} /> went into the till
          </>
        ) : null}
        . <TextLink href="/shop">Go and collect it</TextLink>.
      </p>
    </Surface>
  );
}
