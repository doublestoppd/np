import type { ComponentPropsWithoutRef } from "react";

const CONTROL =
  "w-full rounded-control border border-border-strong bg-surface-raised px-3 py-2.5 text-base text-text placeholder:text-text-muted/70 focus:outline-2 focus:outline-offset-1 focus:outline-accent";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  /** Persistent guidance below the control. */
  help?: string;
  /** Validation message; announced to assistive technology. */
  error?: string;
  children: React.ReactNode;
}

/**
 * Label + control + help/validation wiring. Pass `aria-describedby`
 * matching `<htmlFor>-help` / `<htmlFor>-error` on the control when help or
 * error text is used.
 */
export function FormField({
  label,
  htmlFor,
  help,
  error,
  children,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-text"
      >
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {help && (
        <p id={`${htmlFor}-help`} className="mt-1 text-xs text-text-muted">
          {help}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="mt-1 text-xs font-medium text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"input">) {
  return <input className={`${CONTROL} ${className}`.trim()} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={`${CONTROL} ${className}`.trim()} {...props} />;
}

export function Select({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"select">) {
  return (
    <select className={`${CONTROL} min-h-11 ${className}`.trim()} {...props} />
  );
}
