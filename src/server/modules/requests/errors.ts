import { DomainError } from "@/server/errors";

export type RequestErrorCode =
  | "BOARD_NOT_FOUND"
  | "BOARD_INACTIVE"
  | "NO_CURRENT_REQUEST"
  | "NO_OTHER_REQUEST"
  | "REQUEST_INACTIVE"
  | "INSUFFICIENT_ITEMS"
  | "DAILY_LIMIT_REACHED"
  | "STALE_STATE"
  | "COMMERCE_DISABLED";

/** Player-facing copy; exported for the feedback-banner contract test. */
export const REQUEST_MESSAGES: Record<RequestErrorCode, string> = {
  BOARD_NOT_FOUND: "That request board could not be found.",
  BOARD_INACTIVE: "This board isn't taking requests right now.",
  NO_CURRENT_REQUEST: "There's nothing posted here at the moment.",
  NO_OTHER_REQUEST:
    "This is the only request posted, so there's nothing to swap it for.",
  REQUEST_INACTIVE: "That request was taken down. Refresh for the next one.",
  INSUFFICIENT_ITEMS:
    "You don't have everything this request asks for yet. Nothing was taken.",
  DAILY_LIMIT_REACHED:
    "That's all the kitchen needs today. The next request is waiting for you tomorrow.",
  STALE_STATE:
    "This request moved on while you were looking at it. Nothing was taken — here's where you are now.",
  COMMERCE_DISABLED: "Requests aren't available for this account.",
};

export class RequestError extends DomainError {
  constructor(public readonly requestCode: RequestErrorCode) {
    super(requestCode, REQUEST_MESSAGES[requestCode]);
    this.name = "RequestError";
  }
}
