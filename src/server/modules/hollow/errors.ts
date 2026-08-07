import { DomainError } from "@/server/errors";

export type HollowErrorCode =
  | "UNKNOWN_GROUND"
  | "UNKNOWN_AIR"
  | "UNKNOWN_ANCHOR"
  | "UNKNOWN_FURNISHING"
  | "INVALID_QUANTITY"
  | "GROUND_ALREADY_HELD"
  | "AIR_ALREADY_HELD"
  | "AIR_NOT_HELD"
  | "NO_GROUNDS_LEFT"
  | "SCENE_NOT_FOUND"
  | "NOT_OWNED"
  | "ALL_COPIES_PLACED"
  | "DOES_NOT_FIT"
  | "ANCHOR_EMPTY"
  | "ANCHOR_TAKEN"
  | "CAPTION_TOO_LONG";

const MESSAGES: Record<HollowErrorCode, string> = {
  UNKNOWN_GROUND: "There is no such ground.",
  UNKNOWN_AIR: "There is no such air.",
  UNKNOWN_ANCHOR: "There is nowhere to stand that there.",
  UNKNOWN_FURNISHING: "That isn't a furnishing.",
  INVALID_QUANTITY: "That isn't a sensible number to buy.",
  GROUND_ALREADY_HELD: "That ground is already yours.",
  AIR_ALREADY_HELD: "You already have that air.",
  AIR_NOT_HELD: "You don't have that air yet.",
  NO_GROUNDS_LEFT: "There is no more ground to be had, for now.",
  SCENE_NOT_FOUND: "That ground isn't part of your Hollow.",
  NOT_OWNED: "You don't own one of those.",
  ALL_COPIES_PLACED: "Every one you own is already standing somewhere.",
  DOES_NOT_FIT: "That's too big for this spot.",
  ANCHOR_EMPTY: "There's nothing standing there.",
  ANCHOR_TAKEN: "Something is already standing there.",
  CAPTION_TOO_LONG: "That's a little long for a caption.",
};

export class HollowError extends DomainError {
  constructor(public readonly hollowCode: HollowErrorCode) {
    super(hollowCode, MESSAGES[hollowCode]);
    this.name = "HollowError";
  }
}
