import type { DbReader } from "@/server/db";
import { coinsToJSON } from "@/lib/money";
import { STAKES, TOP_STAKE } from "./config";
import { getFortuneJackpot, type FortuneJackpotView } from "./jackpot";

/**
 * What the machine shows before anybody pulls it (ADR-66).
 *
 * The paytable is not here: it is derived from the reels, lives in
 * lib/games/fortune/reels.ts, and is rendered straight from those
 * constants. A copy of it in a view model would be a second version of the
 * odds, and the whole point of building this on real reel strips is that
 * there is exactly one.
 */
export interface FortuneView {
  /** Serialized stakes, smallest first. The last is the top stake. */
  stakes: string[];
  topStake: string;
  jackpot: FortuneJackpotView;
  /** The player's balance, so the machine can refuse a stake honestly. */
  balance: string;
  /** Their own last few pulls. Never anybody else's. */
  recent: {
    symbols: string[];
    line: string;
    stake: string;
    payout: string;
    jackpot: boolean;
    at: Date;
  }[];
  /** Their own biggest win here, ever. Private, like every other record. */
  bestWin: string;
}

export async function getFortuneView(
  db: DbReader,
  { userId }: { userId: string },
): Promise<FortuneView> {
  const [jackpot, user, recent, best] = await Promise.all([
    getFortuneJackpot(db),
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { coins: true },
    }),
    db.fortuneSpin.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        symbols: true,
        line: true,
        stake: true,
        payout: true,
        jackpot: true,
        createdAt: true,
      },
    }),
    db.fortuneSpin.aggregate({
      where: { userId },
      _max: { payout: true },
    }),
  ]);

  return {
    stakes: STAKES.map(coinsToJSON),
    topStake: coinsToJSON(TOP_STAKE),
    jackpot,
    balance: coinsToJSON(user.coins),
    recent: recent.map((spin) => ({
      symbols: spin.symbols.split(","),
      line: spin.line,
      stake: coinsToJSON(spin.stake),
      payout: coinsToJSON(spin.payout),
      jackpot: spin.jackpot,
      at: spin.createdAt,
    })),
    bestWin: coinsToJSON(best._max.payout ?? 0n),
  };
}
