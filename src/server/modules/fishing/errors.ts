import { DomainError } from "@/server/errors";

export type FishingErrorCode =
  | "SPOT_NOT_FOUND"
  | "SPOT_CLOSED"
  | "NOTHING_BITING"
  | "FISHED_OUT"
  | "CONCURRENT_CAST";

/**
 * None of these is a failure. Running out of casts in particular is the
 * ordinary end of an afternoon, and the copy says so — the water will be
 * there tomorrow and nothing has been lost by stopping.
 */
const PUBLIC_MESSAGES: Record<FishingErrorCode, string> = {
  SPOT_NOT_FOUND: "There's nowhere to fish here.",
  SPOT_CLOSED: "Nothing is rising here just now. Try again another day.",
  NOTHING_BITING: "Nothing is rising here just now. Try again another day.",
  FISHED_OUT:
    "That's your fishing done for today. The water will still be here after the reset at midnight GST.",
  CONCURRENT_CAST: "That cast is already going out. Give it a moment.",
};

export class FishingError extends DomainError {
  constructor(public readonly fishingCode: FishingErrorCode) {
    super(fishingCode, PUBLIC_MESSAGES[fishingCode]);
    this.name = "FishingError";
  }
}
