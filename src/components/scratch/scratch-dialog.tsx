"use client";

import { useId, useState } from "react";
import { formatCoins } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Scratching a chit: the odds first, then the button.
 *
 * The whole table is on screen before anything is spent, and it is not
 * behind a "details" toggle. A game of chance that hides its odds is the
 * shape the design philosophy rules out; one that shows them is a bet the
 * player can actually make (ADR-46). The expected return is stated in the
 * same breath, because "pays back about 70%" is the single most useful
 * fact here and burying it would be the tell that we knew it mattered.
 *
 * Nothing here is authoritative. The server draws from the same prize rows
 * these percentages are computed from.
 */

export interface ScratchOddsRowView {
  label: string;
  kind: "COINS" | "ITEM";
  chance: number;
  coins: string;
  itemName: string | null;
  itemRarity: string | null;
  quantity: number;
}

export function ScratchDialog({
  action,
  itemId,
  itemName,
  owned,
  returnTo,
  priceJson,
  expectedReturnJson,
  rows,
}: {
  action: (formData: FormData) => void | Promise<void>;
  itemId: string;
  itemName: string;
  owned: number;
  returnTo: string;
  priceJson: string;
  expectedReturnJson: string;
  rows: ScratchOddsRowView[];
}) {
  const [open, setOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const titleId = useId();

  const price = BigInt(priceJson);
  const expected = BigInt(expectedReturnJson);
  const percent = price > 0n ? Number((expected * 100n) / price) : 0;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setIdempotencyKey(crypto.randomUUID());
          setOpen(true);
        }}
      >
        Scratch
        <span className="sr-only"> {itemName}</span>
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="max-h-[80vh] overflow-y-auto p-5">
          <h2 id={titleId} className="font-display text-lg font-bold text-text">
            {itemName}
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            {owned === 1 ? "One in your satchel" : `${owned} in your satchel`}.
            Scraping the salt off uses one, and every chit pays something.
          </p>

          <p className="mt-3 rounded-control border border-border bg-surface-sunken px-3 py-2 text-sm text-text">
            Over many chits this one pays back about{" "}
            <strong className="font-semibold">{percent}%</strong> of the{" "}
            {formatCoins(price)} coins it costs. It is meant to be a flutter,
            not an income.
          </p>

          <h3 className="mt-4 text-sm font-medium text-text">
            What&apos;s under the salt
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[16rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">
                    Outcome
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Chance
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-1.5 pr-3">
                      <span className="text-text">{row.label}</span>
                      <span className="block text-xs text-text-muted">
                        {row.kind === "COINS"
                          ? `${formatCoins(BigInt(row.coins))} coins`
                          : `${row.quantity > 1 ? `${row.quantity} × ` : ""}${row.itemName}`}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-text">
                      {row.chance}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={action} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="itemId" value={itemId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <input
              type="hidden"
              name="idempotencyKey"
              value={idempotencyKey}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Not today
            </Button>
            <SubmitButton pendingLabel="Scraping…">Scratch it</SubmitButton>
          </form>
        </div>
      </Modal>
    </>
  );
}
