import { DomainError } from "@/server/errors";

export type LanternErrorCode =
  | "NO_HIDING_PLACES"
  | "ALREADY_FOUND"
  | "OUT_OF_LOOKS"
  | "ALREADY_LOOKED_HERE"
  | "UNKNOWN_PLACE"
  | "CONCURRENT_LOOK";

/**
 * Nothing here is the player's fault and nothing here scolds. Running out
 * of looks in particular is the ordinary end of a normal day — the lantern
 * moves at midnight regardless, so the message says that rather than
 * treating the miss as a loss.
 */
const PUBLIC_MESSAGES: Record<LanternErrorCode, string> = {
  NO_HIDING_PLACES:
    "The lantern hasn't been hidden yet today. Try again shortly.",
  ALREADY_FOUND:
    "You've already found it today. It'll be somewhere else after the reset at midnight UTC.",
  OUT_OF_LOOKS:
    "That's your looking done for today. The lantern moves at midnight UTC and you start fresh — nothing is lost by stopping here.",
  ALREADY_LOOKED_HERE:
    "You've already looked here today. It didn't move while you weren't watching.",
  UNKNOWN_PLACE: "There's nowhere by that name to look.",
  CONCURRENT_LOOK:
    "That look is still being recorded — nothing was lost. Give it a second.",
};

export class LanternError extends DomainError {
  constructor(public readonly lanternCode: LanternErrorCode) {
    super(lanternCode, PUBLIC_MESSAGES[lanternCode]);
    this.name = "LanternError";
  }
}
