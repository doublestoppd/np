import { formatCoins } from "@/lib/money";
import { faceAt } from "@/lib/games/slot-faces";
import type { SlotPrizeRow } from "@/server/modules/slots/queries";

/**
 * What is on a token's drums, richest first (ADR-49).
 *
 * The chits' ladder has always been on their item page; the tokens' was
 * not, so a player holding a Cobalt Token in the satchel could read what a
 * Banded Chit pays but had to walk to Saltmere to find out what their own
 * token was for. This is the same panel for the other machine.
 *
 * The ladder, not the odds — and every face is here, because a tier's face
 * count must equal its number of winning outcomes (validated offline). So
 * this is complete by construction: there is no face on the drum that
 * pays something this does not list.
 */
export function SlotPrizeLadder({
  priceJson,
  faces,
  prizes,
}: {
  priceJson: string;
  faces: number;
  prizes: SlotPrizeRow[];
}) {
  return (
    <>
      <p className="mt-2 max-w-prose text-sm text-text-muted">
        {faces} faces on each of the three drums. Three of a face pays what
        that face is worth; anything else pays nothing, which is most pulls.
        The house does not say how often — that is what the lever is for.
      </p>

      <ul className="mt-3 space-y-1.5">
        {prizes.map((prize) => {
          const face = faceAt(prize.faceIndex);
          return (
            <li
              key={prize.label}
              className="flex items-baseline gap-3 text-sm"
            >
              <span
                aria-hidden="true"
                className="w-14 shrink-0 text-lg tabular-nums"
              >
                {face.glyph}
                {face.glyph}
                {face.glyph}
              </span>
              <span className="min-w-0">
                <span className="sr-only">Three {face.name}: </span>
                <span className="text-text">
                  {prize.kind === "COINS"
                    ? `${formatCoins(BigInt(prize.coins))} coins`
                    : `${prize.quantity > 1 ? `${prize.quantity} × ` : ""}${prize.itemName}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-text-muted">
        One token, one pull, {formatCoins(BigInt(priceJson))} coins to
        replace. The house does not change them back.
      </p>
    </>
  );
}
