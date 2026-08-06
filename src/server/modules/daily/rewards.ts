/**
 * Shared daily reward contract (a result SHAPE, not a database engine).
 * Every value is JSON-safe because activity results are stored as
 * idempotency replay payloads — coins travel as decimal strings
 * (src/lib/money.ts), timestamps as ISO strings.
 */
export type DailyRewardType = "COINS" | "ITEM" | "NOTHING";

export interface DailyRewardResult {
  rewardType: DailyRewardType;
  /** Serialized coins (decimal string); "0" when no coins were awarded. */
  coinsAwarded: string;
  itemId: string | null;
  itemSlug: string | null;
  itemName: string | null;
  itemQuantity: number | null;
  /** Ledger rows written for this reward. */
  economyTransactionIds: string[];
  /** ISO timestamp of the award. */
  awardedAt: string;
}

export const NO_REWARD: Omit<DailyRewardResult, "awardedAt"> = {
  rewardType: "NOTHING",
  coinsAwarded: "0",
  itemId: null,
  itemSlug: null,
  itemName: null,
  itemQuantity: null,
  economyTransactionIds: [],
};
