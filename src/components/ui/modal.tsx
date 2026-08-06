"use client";

import { useEffect, useRef } from "react";

/**
 * Reusable modal dialog.
 *
 * Built on the native `<dialog>` element deliberately: `showModal()` gives
 * a real focus trap, Escape-to-dismiss, inert background content, and
 * top-layer stacking from the platform. Hand-rolled overlays get all four
 * of those subtly wrong, and the third one — background content staying
 * reachable by screen reader and keyboard — is the kind of wrong nobody
 * notices in a screenshot.
 *
 * Closing is always available: `onClose` fires for the button, Escape, and
 * a backdrop click alike, so a dialog can never trap a player.
 */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Id of the element naming the dialog, for `aria-labelledby`. */
  labelledBy: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // `close` covers Escape and programmatic closes; without this the
      // parent's state and the element's state drift apart after Escape.
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // The backdrop is part of the dialog's own box, so a click landing
        // on the element itself (not its content) is a backdrop click.
        if (event.target === ref.current) {
          onClose();
        }
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-surface border border-border bg-surface p-0 text-text shadow-raised backdrop:bg-black/40"
    >
      {children}
    </dialog>
  );
}
