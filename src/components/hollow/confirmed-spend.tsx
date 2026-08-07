"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";
import { coinsFromJSON, formatCoins } from "@/lib/money";

/**
 * Spending in the Hollow, with a second tap when the money warrants one.
 *
 * The catalogue runs from 180 coins to 95,000, and every price used to be
 * a single unconfirmed tap on a scrolling list on a 360px screen. A
 * playtester put it plainly: this is the one thing that would actually
 * make them angry if it happened to them — months of saving gone to a
 * mis-tap, with no sell-back.
 *
 * Confirming *everything* would be worse, though. A Steadying Stone at 180
 * is meant to be bought five times without ceremony, and a dialog in front
 * of it turns a casual purchase into a transaction. So the rule is the one
 * a person would apply themselves: a tap should never cost more than you
 * would shrug at.
 */
const CONFIRM_ABOVE = 1_000n;

export function ConfirmedSpend({
  action,
  hiddenFields,
  /** Serialized coins. */
  price,
  label,
  title,
  description,
  variant = "secondary",
  pendingLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenFields: Record<string, string>;
  price: string;
  label: React.ReactNode;
  /** What is being bought, for the confirmation heading. */
  title: string;
  description?: string;
  variant?: "primary" | "secondary";
  pendingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const total = coinsFromJSON(price);

  const fields = (
    <>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );

  if (total < CONFIRM_ABOVE) {
    return (
      <form action={action}>
        {fields}
        <SubmitButton variant={variant} pendingLabel={pendingLabel}>
          {label}
        </SubmitButton>
      </form>
    );
  }

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="max-h-[80vh] overflow-y-auto p-5">
          <h2 id={titleId} className="font-display text-lg font-bold text-text">
            {title}
          </h2>
          {description && (
            <p className="mt-2 text-sm text-text-muted">{description}</p>
          )}
          <p className="mt-3 text-sm text-text">
            That comes to <CurrencyAmount amount={total} />.
          </p>
          <form action={action} className="mt-5 flex justify-end gap-2">
            {fields}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Not today
            </Button>
            <SubmitButton pendingLabel={pendingLabel}>
              Yes — {formatCoins(total)}
              <span className="sr-only"> coins</span>
            </SubmitButton>
          </form>
        </div>
      </Modal>
    </>
  );
}
