/**
 * Turns an internal grant source into something a player can read.
 *
 * Grant sources like `npc-shop:brassbell-provisions`, `random-event:
 * lantern_moth`, and `admin-grant` are operator vocabulary: they exist so a
 * ledger row can be traced, and they were being printed straight onto the
 * item page ("Acquired Aug 7, 2026 · npc-shop:brassbell-provisions"). A
 * player should be told where something came from, not shown the token the
 * server files it under.
 *
 * This is the one place that vocabulary lives, in the same spirit as
 * src/lib/pet-condition.ts owning the words for pet stats. An unrecognized
 * source degrades to a plain, true sentence rather than leaking the token.
 */

/** Sources that carry a `prefix:key` shape. */
const PREFIXED: Record<string, string> = {
  "npc-shop": "Bought from a shopkeeper",
  "player-shop": "Bought from another player",
};

const EXACT: Record<string, string> = {
  "daily-wheel": "Won on the prize wheel",
  "daily-meal": "A helping from the community kitchen",
  "starter-pack": "Came along with your first companion",
  "random-event": "Found while wandering",
  "admin-grant": "A gift from the grove's keepers",
  "admin:listing-disabled": "Returned from a closed listing",
  "player-shop:cancelled": "Returned from your shop",
  "account-deactivation": "Returned when an account closed",
};

export function describeAcquisition(source: string): string {
  const exact = EXACT[source];
  if (exact) {
    return exact;
  }
  const prefix = source.split(":")[0] ?? "";
  return PREFIXED[prefix] ?? EXACT[prefix] ?? "Acquired in the grove";
}

export interface ProvenanceEventCopyInput {
  eventType: string;
  sourceType: string;
  fromUsername: string | null;
  toUsername: string | null;
}

/**
 * One line of an item's history. Transfers name the players involved,
 * because that is the interesting fact about a one-of-a-kind object
 * changing hands; everything else describes the origin.
 */
export function describeProvenanceEvent({
  eventType,
  sourceType,
  fromUsername,
  toUsername,
}: ProvenanceEventCopyInput): string {
  if (eventType === "transferred") {
    if (fromUsername && toUsername) {
      return `Passed from ${fromUsername} to ${toUsername}`;
    }
    if (toUsername) {
      return `Passed to ${toUsername}`;
    }
    return "Changed hands";
  }
  if (eventType === "created") {
    return `Entered the grove — ${describeAcquisition(sourceType).toLowerCase()}`;
  }
  return describeAcquisition(sourceType);
}
