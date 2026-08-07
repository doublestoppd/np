/**
 * Base class for domain errors (docs/conventions.md): a stable
 * machine-readable `code` plus a player-safe `publicMessage`. UI boundaries
 * map codes/messages to copy; internal details never leak to players.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(code);
    this.name = "DomainError";
  }
}

/**
 * The fallback for anything that isn't a DomainError. It says what
 * happened to the player's money, because this message appears on purchase
 * paths, and "That didn't work" left a player who had just tapped Buy with
 * no idea whether they had been charged. Every operation that could take
 * coins runs inside a transaction, so a failure means nothing was taken —
 * which makes this the truth, not a reassurance.
 */
export const GENERIC_ERROR_MESSAGE =
  "That didn't work, and nothing was taken. Try again.";
