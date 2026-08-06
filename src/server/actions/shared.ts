import { redirect } from "next/navigation";
import { DomainError, GENERIC_ERROR_MESSAGE } from "@/server/errors";

/**
 * Boundary helpers for server actions (docs/conventions.md): actions
 * authenticate, parse validated input, call one application operation, map
 * domain errors to player-facing text, revalidate, and redirect. Domain
 * policy lives in modules — never here.
 */

const ALLOWED_RETURN_PREFIXES = [
  "/explore",
  "/items",
  "/market",
  "/shops",
  "/shop",
  "/inventory",
];

export function safeReturnTo(
  value: FormDataEntryValue | null,
  fallback: string,
): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("?") &&
    ALLOWED_RETURN_PREFIXES.some(
      (prefix) => value === prefix || value.startsWith(`${prefix}/`),
    )
  ) {
    return value;
  }
  return fallback;
}

/** Maps a thrown error to a player-facing message (never internals). */
export function publicErrorMessage(error: unknown): string {
  return error instanceof DomainError ? error.publicMessage : GENERIC_ERROR_MESSAGE;
}

export function failWith(returnTo: string, error: unknown): never {
  redirect(`${returnTo}?error=${encodeURIComponent(publicErrorMessage(error))}`);
}

export function succeedWith(returnTo: string, notice: string): never {
  redirect(`${returnTo}?notice=${encodeURIComponent(notice)}`);
}

export function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}
