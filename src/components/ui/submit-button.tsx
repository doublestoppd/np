"use client";

import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonVariant } from "./button";

interface SubmitButtonProps {
  children: React.ReactNode;
  /** Label announced and shown while the server action is pending. */
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
}

/**
 * Form submit button with a pending state for server actions. The pending
 * state uses text + disabled, never animation alone, so it works with
 * reduced motion and assistive technology.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  className = "",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={buttonClasses(variant, className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
