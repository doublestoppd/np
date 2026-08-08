import { DomainError } from "@/server/errors";

export type ScratchErrorCode =
  | "NOT_A_CARD"
  | "NONE_IN_SATCHEL"
  | "CARD_WITHDRAWN"
  | "TABLE_UNAVAILABLE";

/**
 * Nothing here blames the player, and nothing here is a near miss. A card
 * that cannot be scratched right now says so plainly and says nothing was
 * spent, because nothing was.
 */
const PUBLIC_MESSAGES: Record<ScratchErrorCode, string> = {
  NOT_A_CARD: "That isn't something you can scratch.",
  NONE_IN_SATCHEL: "You don't have one of those to scratch.",
  CARD_WITHDRAWN:
    "That chit has been withdrawn and can't be scratched. Nothing was used.",
  TABLE_UNAVAILABLE:
    "The rakers can't honour that chit just now. Nothing was used — try again shortly.",
};

export class ScratchError extends DomainError {
  constructor(public readonly scratchCode: ScratchErrorCode) {
    super(scratchCode, PUBLIC_MESSAGES[scratchCode]);
    this.name = "ScratchError";
  }
}
