import { DomainError } from "@/server/errors";

export type ArcadeErrorCode =
  | "RUN_NOT_FOUND"
  | "RUN_FINISHED"
  | "RUN_STALE"
  | "IMPLAUSIBLE"
  | "CONCURRENT_SUBMIT"
  | "RUN_NOT_SCORED"
  | "ALREADY_CLAIMED"
  | "RUN_SUPERSEDED"
  | "NOTHING_TO_CLAIM"
  | "CLAIMS_SPENT";

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
  RUN_NOT_SCORED: "That go hasn't been scored yet, so there's nothing to take.",
  ALREADY_CLAIMED: "That one's already been taken. It only pays once.",
  // Not a refusal so much as a consequence, and worth stating plainly:
  // choosing to go again is what gives up the run before it (ADR-64).
  RUN_SUPERSEDED:
    "You went again, so that score is behind you now. Whatever this run ends on is the one you can take.",
  NOTHING_TO_CLAIM: "That go didn't get far enough to pay. Have another.",
  CLAIMS_SPENT:
    "That's today's three taken. Playing carries on regardless — there's no limit on that.",
};

export class ArcadeError extends DomainError {
  constructor(
    public readonly arcadeCode: ArcadeErrorCode,
    /**
     * Which check refused it, and any numbers worth keeping. Operator-only
     * — it reaches the security log and never the player, for the reason
     * in the IMPLAUSIBLE message above.
     */
    public readonly refusal?: {
      reason: string;
      detail?: Record<string, number>;
    },
  ) {
    super(arcadeCode, PUBLIC_MESSAGES[arcadeCode]);
    this.name = "ArcadeError";
  }
}
