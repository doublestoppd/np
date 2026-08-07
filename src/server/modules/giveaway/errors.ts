import { DomainError } from "@/server/errors";

export type GiveawayErrorCode =
  | "NOT_DONATABLE"
  | "INSUFFICIENT_ITEMS"
  | "SHELF_FULL"
  | "GAVE_ENOUGH_TODAY"
  | "TOOK_ENOUGH_TODAY"
  | "GONE"
  | "YOUR_OWN"
  | "ALREADY_TOOK_ONE"
  | "CONCURRENT_TAKE";

/**
 * The shelf's failures are all ordinary, and none of them is the player's
 * fault, so none of them scolds. "Gone" in particular is the common case
 * and has to read as a shrug: somebody else wanted it, which is the shelf
 * working, not the player losing a race.
 */
const PUBLIC_MESSAGES: Record<GiveawayErrorCode, string> = {
  NOT_DONATABLE:
    "That one can't go on the shelf. Anything you could sell to another player, you can leave here.",
  INSUFFICIENT_ITEMS: "You don't have that many to spare.",
  SHELF_FULL:
    "The shelf is full to the edges. Something will come off it shortly — try again in a bit.",
  GAVE_ENOUGH_TODAY:
    "You've left plenty today. The shelf will take more after the reset at midnight UTC.",
  TOOK_ENOUGH_TODAY:
    "You've taken your share for today. There'll be more after the reset at midnight UTC.",
  GONE: "Somebody else got there first. That's the shelf working as intended.",
  YOUR_OWN:
    "That's the lot you left. Once it's on the shelf it belongs to whoever wants it.",
  ALREADY_TOOK_ONE:
    "You've had one from that lot. The rest are for somebody else.",
  CONCURRENT_TAKE: "That one's already on its way to you. Give it a moment.",
};

export class GiveawayError extends DomainError {
  constructor(public readonly giveawayCode: GiveawayErrorCode) {
    super(giveawayCode, PUBLIC_MESSAGES[giveawayCode]);
    this.name = "GiveawayError";
  }
}
