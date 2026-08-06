/**
 * Technical safety bounds (docs/conventions.md). These protect the database
 * and request handlers; they are deliberately far above any gameplay-
 * relevant scale and must not be tuned as gameplay restrictions.
 */
export const LIMITS = {
  /** Max units in a single stack listing or grant request. */
  stackQuantity: 1_000,
  /** Max units per NPC purchase request. */
  npcPurchaseQuantity: 10,
  /** Max results per search/history page. */
  searchPageSize: 24,
  historyPageSize: 25,
  itemInstanceResults: 100,
  /** Text field ceilings (validated in Zod schemas as well). */
  usernameLength: 20,
  petNameLength: 24,
  titleLength: 60,
  bioLength: 300,
  shopNameLength: 40,
  shopDescriptionLength: 200,
  searchQueryLength: 60,
  /** Idempotency key and serialized payload ceilings. */
  idempotencyKeyLength: 64,
  idempotencyPayloadBytes: 8_192,
  metadataBytes: 8_192,
} as const;
