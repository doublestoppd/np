/**
 * Technical safety bounds (docs/conventions.md). These protect the database
 * and request handlers; they are deliberately far above any gameplay-
 * relevant scale and must not be tuned as gameplay restrictions.
 *
 * Only bounds that live HERE belong here. Every text-field ceiling and
 * page size is owned by the Zod schema or query module that enforces it
 * (src/lib/validation.ts, commerce/history.ts); a copy in this table
 * enforced nothing, and one of them had already drifted — it claimed a
 * 24-item search page while the market offered up to 100.
 */
export const LIMITS = {
  /** Max units in a single stack listing or grant request. */
  stackQuantity: 1_000,
  /** Max units per NPC purchase request. */
  npcPurchaseQuantity: 10,
} as const;
