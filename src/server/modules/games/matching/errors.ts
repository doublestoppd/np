import { DomainError } from "@/server/errors";

export type MatchingErrorCode =
  | "RUN_NOT_FOUND"
  | "RUN_FINISHED"
  | "OUT_OF_FLIPS"
  | "ILLEGAL_FLIP"
  | "CONCURRENT_FLIP";

const PUBLIC_MESSAGES: Record<MatchingErrorCode, string> = {
  RUN_NOT_FOUND: "That table isn't set. Start a fresh one.",
  RUN_FINISHED: "That one's finished. Set the stones again for another go.",
  OUT_OF_FLIPS:
    "That's the last turn on this table. Set it again whenever you like — there's no limit on playing.",
  ILLEGAL_FLIP:
    "That stone can't be turned. The table has been reset — nothing was lost.",
  CONCURRENT_FLIP: "That turn is still being recorded. Give it a second.",
};

export class MatchingError extends DomainError {
  constructor(public readonly matchingCode: MatchingErrorCode) {
    super(matchingCode, PUBLIC_MESSAGES[matchingCode]);
    this.name = "MatchingError";
  }
}
