import { DomainError } from "@/server/errors";

export type CaveErrorCode =
  | "NO_SECTIONS"
  | "EMPTY_HOARD"
  | "ALREADY_DELVED"
  | "NO_DELVE"
  | "DELVE_OVER"
  | "CONCURRENT_CHOICE"
  | "WRONG_ROOM";

/**
 * What a player is told. Nothing here scolds, and nothing implies a loss —
 * being seen off a cave keeps every coin already found, and the copy has
 * to say so or a player will assume the worst.
 */
const PUBLIC_MESSAGES: Record<CaveErrorCode, string> = {
  NO_SECTIONS:
    "The stair is shut this morning — somebody is measuring it. Try again later.",
  EMPTY_HOARD:
    "The stair is shut this morning — somebody is measuring it. Try again later.",
  ALREADY_DELVED:
    "You've been down today. It'll be a different cave tomorrow — the doors never sit the same way twice.",
  NO_DELVE: "You aren't down there just now. Go in first.",
  DELVE_OVER:
    "That descent is finished. Nothing is lost — whatever you found is in your satchel, and the stair resets at midnight GST.",
  CONCURRENT_CHOICE: "That door is still swinging. Give it a second.",
  WRONG_ROOM: "You've moved on from that room. The board has caught up.",
};

export class CaveError extends DomainError {
  constructor(public readonly caveCode: CaveErrorCode) {
    super(caveCode, PUBLIC_MESSAGES[caveCode]);
    this.name = "CaveError";
  }
}
