import { DomainError } from "@/server/errors";

export type ShrineErrorCode =
  | "NO_SHRINE"
  | "NOT_YOURS"
  | "GUESTBOOK_CLOSED"
  | "NOT_PUBLISHED"
  | "OWN_GUESTBOOK"
  | "EMPTY";

const PUBLIC_MESSAGES: Record<ShrineErrorCode, string> = {
  NO_SHRINE: "That keeper hasn't built a shrine.",
  NOT_YOURS: "That isn't your shrine.",
  GUESTBOOK_CLOSED: "The guestbook is closed.",
  NOT_PUBLISHED: "That shrine isn't open to visitors yet.",
  // Not a rule about vanity — a guestbook you can sign yourself is just a
  // second body field, and the page already has one of those.
  OWN_GUESTBOOK: "Signing your own guestbook is what the page is for.",
  EMPTY: "Write something first.",
};

export class ShrineError extends DomainError {
  constructor(public readonly shrineCode: ShrineErrorCode) {
    super(shrineCode, PUBLIC_MESSAGES[shrineCode]);
    this.name = "ShrineError";
  }
}
