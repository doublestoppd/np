import { DomainError } from "@/server/errors";

export type SortingErrorCode =
  | "RUN_NOT_FOUND"
  | "RUN_FINISHED"
  | "STALE_BATCH"
  | "INVALID_BATCH";

const PUBLIC_MESSAGES: Record<SortingErrorCode, string> = {
  RUN_NOT_FOUND: "That run isn't yours, or it isn't there any more.",
  RUN_FINISHED: "That run is already over. Start another whenever you like.",
  // Not an accusation: a second tab, or a resubmitted batch, lands here.
  STALE_BATCH:
    "The bench moved on while that was in flight. Nothing was lost — here's where you are.",
  INVALID_BATCH: "That doesn't look like a set of moves. Start a fresh run.",
};

export class SortingError extends DomainError {
  constructor(public readonly sortingCode: SortingErrorCode) {
    super(sortingCode, PUBLIC_MESSAGES[sortingCode]);
    this.name = "SortingError";
  }
}
