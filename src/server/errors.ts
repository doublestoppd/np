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

export const GENERIC_ERROR_MESSAGE = "That didn't work. Try again.";
