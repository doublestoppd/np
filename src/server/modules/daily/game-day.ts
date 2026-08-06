import { DomainError } from "@/server/errors";
import { systemClock, type Clock } from "@/server/clock";

/**
 * The canonical global game day (docs/architecture-decisions.md ADR-22).
 * One game day applies to every player; it resets at 00:00 UTC. The game
 * day is represented as a validated "YYYY-MM-DD" string derived only from
 * server time — never from the client's locale, timezone, or input.
 */
export type GameDate = string;

const GAME_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidGameDateError extends DomainError {
  constructor() {
    super("INVALID_GAME_DATE", "That date isn't valid.");
  }
}

export function isGameDate(value: unknown): value is GameDate {
  if (typeof value !== "string" || !GAME_DATE_PATTERN.test(value)) {
    return false;
  }
  // Round-trip through UTC to reject impossible dates like 2026-02-30.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && gameDateFor(parsed) === value;
}

export function assertGameDate(value: unknown): GameDate {
  if (!isGameDate(value)) {
    throw new InvalidGameDateError();
  }
  return value;
}

/** The game date a given instant belongs to (UTC calendar date). */
export function gameDateFor(timestamp: Date): GameDate {
  return timestamp.toISOString().slice(0, 10);
}

/** The current game date from the authoritative server clock. */
export function currentGameDate(clock: Clock = systemClock): GameDate {
  return gameDateFor(clock.now());
}

/** 00:00:00.000 UTC at the start of the game date. */
export function startOfGameDate(gameDate: GameDate): Date {
  return new Date(`${assertGameDate(gameDate)}T00:00:00.000Z`);
}

/** 00:00:00.000 UTC of the following game date (the reset instant). */
export function nextGameDateStart(gameDate: GameDate): Date {
  return new Date(startOfGameDate(gameDate).getTime() + 86_400_000);
}

/** The game date `days` after (or before, when negative) the given one. */
export function addGameDays(gameDate: GameDate, days: number): GameDate {
  return gameDateFor(
    new Date(startOfGameDate(gameDate).getTime() + days * 86_400_000),
  );
}
