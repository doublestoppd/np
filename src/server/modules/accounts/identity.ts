/**
 * Canonical account identity (docs/conventions.md).
 *
 * Normalization rule: trim, then lowercase. The username policy already
 * restricts input to ASCII letters/digits/underscore, so lowercase is
 * unambiguous; the rule is applied with Unicode NFKC first as
 * belt-and-braces should the charset ever widen. `normalizedUsername` is
 * the unique identity used for sign-in, profile lookup, and default shop
 * slugs; the display `username` preserves the user's chosen casing.
 */
export function normalizeUsername(username: string): string {
  return username.normalize("NFKC").trim().toLowerCase();
}
