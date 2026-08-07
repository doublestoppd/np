import { formatCoins } from "@/lib/money";
import type { ScratchOddsRow } from "@/server/modules/scratch/queries";

/**
 * The published prize table, shared by the item page and the scratch
 * dialog so there is exactly one rendering of the odds (ADR-46).
 *
 * Server component: no state, and it must be readable by anyone looking at
 * the item, whether or not they own one.
 */
export function ScratchOddsTable({
  priceJson,
  expectedReturnJson,
  rows,
}: {
  priceJson: string;
  expectedReturnJson: string;
  rows: ScratchOddsRow[];
}) {
  const price = BigInt(priceJson);
  const expected = BigInt(expectedReturnJson);
  const percent = price > 0n ? Number((expected * 100n) / price) : 0;

  return (
    <>
      <p className="mt-1 max-w-prose text-sm text-text-muted">
        Every chit pays something — there are no blanks. Over many of them
        this one returns about{" "}
        <strong className="font-semibold text-text">{percent}%</strong> of the{" "}
        {formatCoins(price)} coins it costs, so it is a flutter rather than an
        income. The percentages below are the ones the draw actually uses.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[18rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-text-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Outcome
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                What you get
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Chance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/50">
                <td className="py-1.5 pr-3 text-text">{row.label}</td>
                <td className="py-1.5 pr-3 text-text-muted">
                  {row.kind === "COINS"
                    ? `${formatCoins(BigInt(row.coins))} coins`
                    : `${row.quantity > 1 ? `${row.quantity} × ` : ""}${row.itemName}`}
                </td>
                <td className="py-1.5 text-right tabular-nums text-text">
                  {row.chance}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
