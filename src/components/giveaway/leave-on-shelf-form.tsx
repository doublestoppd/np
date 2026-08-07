"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SubmitButton } from "@/components/ui/submit-button";

export interface DonatableStack {
  itemId: string;
  name: string;
  held: number;
}

/**
 * Leaving something on the shelf.
 *
 * The confirmation is not ceremony. A gift here is final in a way nothing
 * else in the game is: the copies leave the satchel immediately, there is
 * no cancel, no reclaim, and no return when the lot goes cold — so the
 * dialog says the irreversible part in plain words before the tap that
 * does it. The Hollow applies the same rule to money above a thousand
 * coins; this applies it to everything, because "gone" is a bigger word
 * than "expensive".
 *
 * The quantity control is a select rather than a number input on purpose:
 * the ceiling depends on what is chosen, and a number input either lets a
 * thumb type past the ceiling or needs a second message to explain it.
 */
export function LeaveOnShelfForm({
  action,
  returnTo,
  idempotencyKey,
  donatable,
  maxQuantity,
}: {
  action: (formData: FormData) => void | Promise<void>;
  returnTo: string;
  /** Generated once per render on the server, like every other form. */
  idempotencyKey: string;
  donatable: DonatableStack[];
  maxQuantity: number;
}) {
  const [itemId, setItemId] = useState(donatable[0]?.itemId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [open, setOpen] = useState(false);
  const itemFieldId = useId();
  const quantityFieldId = useId();
  const titleId = useId();

  // Falls back to the first stack when the selection no longer exists —
  // giving away the last of something removes it from this list, and the
  // component is reconciled rather than remounted, so without the fallback
  // the control would sit on a phantom item with the button disabled.
  const chosen =
    donatable.find((stack) => stack.itemId === itemId) ?? donatable[0];
  const activeId = chosen?.itemId ?? "";
  const ceiling = Math.min(maxQuantity, chosen?.held ?? 1);
  // A stack that shrank under a stale render would otherwise submit a
  // quantity nobody can honour; the server refuses it either way, but
  // there is no reason to offer it.
  const effectiveQuantity = Math.min(quantity, ceiling);
  const what =
    chosen === undefined
      ? ""
      : effectiveQuantity > 1
        ? `${effectiveQuantity} × ${chosen.name}`
        : chosen.name;

  return (
    <div className="flex flex-col gap-3">
      <FormField
        label="What to leave"
        htmlFor={itemFieldId}
        help="Anything you could sell to another player."
      >
        <Select
          id={itemFieldId}
          value={activeId}
          onChange={(event) => {
            setItemId(event.target.value);
            setQuantity(1);
          }}
        >
          {donatable.map((stack) => (
            <option key={stack.itemId} value={stack.itemId}>
              {stack.name} (×{stack.held})
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="How many"
        htmlFor={quantityFieldId}
        help="One per person, so a handful reaches a handful of people."
      >
        <Select
          id={quantityFieldId}
          value={String(effectiveQuantity)}
          onChange={(event) => setQuantity(Number(event.target.value))}
        >
          {Array.from({ length: ceiling }, (_, index) => index + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </FormField>

      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          disabled={chosen === undefined}
        >
          Leave it on the shelf
        </Button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="max-h-[80vh] overflow-y-auto p-5">
          <h2 id={titleId} className="font-display text-lg font-bold text-text">
            Leave {what}?
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            It stops being yours the moment it goes down. You can&apos;t take
            it back, and whatever nobody picks up is gone rather than
            returned.
          </p>
          <form action={action} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="itemId" value={activeId} />
            <input
              type="hidden"
              name="quantity"
              value={String(effectiveQuantity)}
            />
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
              Keep it
            </Button>
            <SubmitButton pendingLabel="Setting it down…">
              Leave it
            </SubmitButton>
          </form>
        </div>
      </Modal>
    </div>
  );
}
