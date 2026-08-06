import type { ComponentPropsWithoutRef } from "react";

interface IconButtonProps extends ComponentPropsWithoutRef<"button"> {
  /** Required accessible name — icon-only controls never ship without one. */
  label: string;
  children: React.ReactNode;
}

/**
 * A square icon-only button with a full-size touch target (44px minimum)
 * and a mandatory accessible name.
 */
export function IconButton({
  label,
  children,
  className = "",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-border-strong bg-surface text-text transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${className}`.trim()}
      {...props}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
