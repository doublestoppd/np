import type { ComponentPropsWithoutRef } from "react";
import Link from "next/link";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-contrast hover:bg-accent-strong",
  secondary:
    "border border-border-strong bg-surface text-text hover:bg-accent-soft",
  quiet: "text-accent hover:bg-accent-soft",
  destructive: "bg-danger text-accent-contrast hover:bg-danger/85",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  className = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${className}`.trim();
}

interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, className)}
      {...props}
    />
  );
}

interface LinkButtonProps extends ComponentPropsWithoutRef<typeof Link> {
  variant?: ButtonVariant;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: LinkButtonProps) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}
