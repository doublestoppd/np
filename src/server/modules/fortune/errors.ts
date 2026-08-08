import { DomainError } from "@/server/errors";

export type FortuneErrorCode = "BAD_STAKE" | "NOT_ENOUGH_COINS";

const PUBLIC_MESSAGES: Record<FortuneErrorCode, string> = {
  BAD_STAKE: "That isn't one of the stakes the engine takes.",
  // Names the shortfall plainly rather than dressing it up. A machine that
  // says "top up to keep playing" when a player has run out is pushing;
  // this one just says no.
  NOT_ENOUGH_COINS: "Not enough coins for that stake.",
};

export class FortuneError extends DomainError {
  constructor(public readonly fortuneCode: FortuneErrorCode) {
    super(fortuneCode, PUBLIC_MESSAGES[fortuneCode]);
    this.name = "FortuneError";
  }
}
