import { DomainError } from "@/server/errors";

export type ForumErrorCode =
  | "BOARD_NOT_FOUND"
  | "BOARD_INACTIVE"
  | "BOARD_STAFF_ONLY"
  | "THREAD_NOT_FOUND"
  | "THREAD_LOCKED"
  | "THREAD_GONE"
  | "POST_NOT_FOUND"
  | "POST_GONE"
  | "NOT_YOURS"
  | "EDIT_WINDOW_PASSED"
  | "OPENING_POST";

/**
 * Nothing here blames the player for the state of the world, and nothing
 * pretends a thing exists that does not. A locked thread says it is
 * locked; a removed one says it is gone, without saying who removed it or
 * why — that conversation belongs between a moderator and the person
 * whose post it was, not in a form error.
 */
const PUBLIC_MESSAGES: Record<ForumErrorCode, string> = {
  BOARD_NOT_FOUND: "That board doesn't exist.",
  BOARD_INACTIVE: "That board is closed to new threads.",
  BOARD_STAFF_ONLY:
    "Only the people running the game start threads on this board. You can still reply.",
  THREAD_NOT_FOUND: "That thread doesn't exist.",
  THREAD_LOCKED: "This thread is closed to new replies.",
  THREAD_GONE: "That thread is no longer here.",
  POST_NOT_FOUND: "That post doesn't exist.",
  POST_GONE: "That post is no longer here.",
  NOT_YOURS: "You can only edit or withdraw your own posts.",
  EDIT_WINDOW_PASSED:
    "This post is old enough that people have had a chance to read it, so it can't be edited now. You can still withdraw it.",
  OPENING_POST:
    "That's the post the thread opens with — withdrawing it withdraws the thread.",
};

export class ForumError extends DomainError {
  constructor(public readonly forumCode: ForumErrorCode) {
    super(forumCode, PUBLIC_MESSAGES[forumCode]);
    this.name = "ForumError";
  }
}
