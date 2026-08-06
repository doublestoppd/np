import type { ComponentPropsWithoutRef } from "react";
import Link from "next/link";

const STYLE =
  "text-accent underline underline-offset-2 hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm";

/** The one inline text link treatment (body copy, metadata rows). */
export function TextLink({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof Link>) {
  return <Link className={`${STYLE} ${className}`.trim()} {...props} />;
}
