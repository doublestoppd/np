"use client";

import { useId, useState } from "react";
import { coinsFromJSON, formatCoins } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { Input } from "@/components/ui/field";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Buying a stack: a compact trigger on the card, and the whole decision in
 * a dialog.
 *
 * A shelf is for browsing — name, art, rarity, price, how many are left.
 * A quantity field on every card asked the player to commit to a number
 * before they had read anything, and cost a band of card height on every
 * row to do it. Choosing to buy is a separate moment, so it gets a
 * separate surface, and that surface can afford to show what the item
 * actually is: the same facts the item page shows when you examine one.
 *
 * Shared by NPC shelves and player listings, because the question is the
 * same one in both places: five of something for sale is five things, not
 * a bundle, and the buyer decides how many they want. The differences —
 * which server action, which hidden fields — are props.
 *
 * Nothing here is authoritative. The total is a display convenience; the
 * server recomputes the price from the stored row, re-checks the quantity,
 * and is the only thing that can move a coin.
 */

export interface PurchaseDialogItem {
  name: string;
  slug: string;
  description: string;
  categoryName: string | null;
  /**
   * What the item is for, in words — "A hearty meal", "A real treat".
   * Computed server-side (src/lib/pet-condition.ts) so the dialog stays
   * free of game rules. Null for items with no use to describe.
   */
  useSummary: string | null;
  /** Decimal string — coins are bigint end to end (src/lib/money.ts). */
  priceJson: string;
  tradeable: boolean;
  stackable: boolean;
}

export function PurchaseDialog({
  action,
  hiddenFields,
  available,
  maxPerPurchase = 10,
  item,
  balanceJson,
  seller,
  art,
  badges,
}: {
  /** Server action that performs the purchase. */
  action: (formData: FormData) => void | Promise<void>;
  /** Everything the action needs to identify what is being bought. */
  hiddenFields: Record<string, string>;
  /** Units on offer; the server re-checks this at purchase time. */
  available: number;
  /** Upper bound per purchase, mirroring the action's own schema. */
  maxPerPurchase?: number;
  item: PurchaseDialogItem;
  balanceJson: string;
  /** Shown for player listings; omitted for NPC shelves. */
  seller?: string;
  /** Server-rendered artwork, passed through rather than re-derived. */
  art: React.ReactNode;
  /** Server-rendered rarity/lifecycle badges, for one source of truth. */
  badges: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  /**
   * Minted per dialog opening rather than per render, and here rather than
   * via `IdempotencyField` — that component generates on the server and so
   * would drag `node:crypto` into the browser bundle. One key per opening
   * is the right granularity anyway: a double-tapped confirm replays the
   * first purchase, while deciding to buy again mints a new one.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const titleId = useId();
  const quantityId = useId();

  const unitPrice = coinsFromJSON(item.priceJson);
  const balance = coinsFromJSON(balanceJson);
  const max = Math.min(maxPerPurchase, available);
  const clamped = Math.min(Math.max(quantity, 1), max);
  const total = unitPrice * BigInt(clamped);
  const affordable = total <= balance;

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setIdempotencyKey(crypto.randomUUID());
          setQuantity(1);
          setOpen(true);
        }}
      >
        Buy
        <span className="sr-only"> {item.name}</span>
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="max-h-[80vh] overflow-y-auto p-5">
          <div className="flex gap-3">
            <div className="w-24 shrink-0">{art}</div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="font-display text-lg font-bold text-text"
              >
                {item.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {badges}
              </div>
            </div>
          </div>

          <p className="mt-3 text-sm text-text-muted">{item.description}</p>
          {item.useSummary && (
            <p className="mt-2 text-sm text-text">{item.useSummary}</p>
          )}
          <p className="mt-2 text-sm text-text-muted">
            Price: <CurrencyAmount amount={unitPrice} /> each ·{" "}
            {available === 1 ? "1 left" : `${available} left`}
            {seller ? ` · sold by ${seller}` : ""}
          </p>

          <form action={action} className="mt-4">
            {Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input
              type="hidden"
              name="idempotencyKey"
              value={idempotencyKey}
            />

            <label
              htmlFor={quantityId}
              className="block text-sm font-medium text-text"
            >
              How many?
            </label>
            <div className="mt-1 flex items-center gap-3">
              <div className="w-24">
                <Input
                  id={quantityId}
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={max}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(Number(event.target.value) || 1)
                  }
                />
              </div>
              <p className="text-sm text-text-muted">
                Total <CurrencyAmount amount={total} />
              </p>
            </div>

            {!affordable && (
              <div className="mt-3">
                <InlineNotice tone="warning">
                  That comes to {formatCoins(total)} coins and you have{" "}
                  {formatCoins(balance)}.
                </InlineNotice>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Not today
              </Button>
              <SubmitButton pendingLabel="Buying…" disabled={!affordable}>
                Buy for {formatCoins(total)}
                <span className="sr-only"> coins</span>
              </SubmitButton>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
