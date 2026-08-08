import { DomainError } from "@/server/errors";

export type SlotErrorCode =
  | "NOT_A_TOKEN"
  | "NONE_IN_SATCHEL"
  | "TOKEN_WITHDRAWN"
  | "TABLE_UNAVAILABLE";

/**
 * Nothing here blames the player, and every message says explicitly
 * whether the token was spent — because the one thing a machine like this
 * must never leave ambiguous is whether it took your money.
 */
const PUBLIC_MESSAGES: Record<SlotErrorCode, string> = {
  NOT_A_TOKEN: "That isn't something the drums take.",
  NONE_IN_SATCHEL: "You don't have one of those to feed in.",
  TOKEN_WITHDRAWN:
    "The house has stopped honouring that token. Nothing was used.",
  TABLE_UNAVAILABLE:
    "The drums are being reset just now. Nothing was used — try again shortly.",
};

export class SlotError extends DomainError {
  constructor(public readonly slotCode: SlotErrorCode) {
    super(slotCode, PUBLIC_MESSAGES[slotCode]);
    this.name = "SlotError";
  }
}
