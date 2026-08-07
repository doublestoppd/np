import { DomainError } from "@/server/errors";

export type ForageErrorCode =
  | "SPOT_NOT_FOUND"
  | "SPOT_CLOSED"
  | "NOTHING_TO_FIND"
  | "SEARCHED_OUT"
  | "CONCURRENT_SEARCH";

const PUBLIC_MESSAGES: Record<ForageErrorCode, string> = {
  SPOT_NOT_FOUND: "There's nowhere to search here.",
  SPOT_CLOSED: "Nothing is growing here just now. Try again another day.",
  NOTHING_TO_FIND: "Nothing is growing here just now. Try again another day.",
  // Deliberately not "you have used up your searches" — the player has not
  // lost anything, and tomorrow is not a punishment.
  SEARCHED_OUT:
    "You've had a good look around for today. There'll be more after the reset at midnight UTC.",
  CONCURRENT_SEARCH:
    "That search is already happening. Give it a moment and look again.",
};

export class ForageError extends DomainError {
  constructor(public readonly forageCode: ForageErrorCode) {
    super(forageCode, PUBLIC_MESSAGES[forageCode]);
    this.name = "ForageError";
  }
}
