import { DomainError } from "@/server/errors";

export type ArcadeErrorCode =
  | "RUN_NOT_FOUND"
  | "RUN_FINISHED"
  | "RUN_STALE"
  | "IMPLAUSIBLE"
  | "CONCURRENT_SUBMIT";

/**
 * What the player is told.
 *
 * `IMPLAUSIBLE` is the interesting one. It is the message a cheat gets,
 * and it deliberately does not say which check failed: naming the rule
 * that caught you is a free hint about how to get past it next time. It is
 * also written so that the vanishingly rare honest player who trips it —
 * a suspended tab, a clock that jumped — is not accused of anything.
 */
const PUBLIC_MESSAGES: Record<ArcadeErrorCode, string> = {
  RUN_NOT_FOUND: "That go isn't on. Start a fresh one.",
  RUN_FINISHED: "That one's already in. Have another go whenever you like.",
  RUN_STALE:
    "That go has been open too long to score. Nothing is lost — start another.",
  IMPLAUSIBLE:
    "That go couldn't be scored, so nothing was recorded for it. Have another — there's no limit on playing.",
  CONCURRENT_SUBMIT: "That's still being scored. Give it a second.",
};

export class ArcadeError extends DomainError {
  constructor(
    public readonly arcadeCode: ArcadeErrorCode,
    /**
     * Which check refused it, and any numbers worth keeping. Operator-only
     * — it reaches the security log and never the player, for the reason
     * in the IMPLAUSIBLE message above.
     */
    public readonly refusal?: { reason: string; detail?: Record<string, number> },
  ) {
    super(arcadeCode, PUBLIC_MESSAGES[arcadeCode]);
    this.name = "ArcadeError";
  }
}
