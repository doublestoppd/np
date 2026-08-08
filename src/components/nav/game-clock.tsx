"use client";

import { useEffect, useState } from "react";
import {
  GAME_TIME_LABEL,
  GAME_TIME_NAME,
  formatGameClock,
  formatGameDate,
} from "@/lib/game-time";

/**
 * The server's clock, ticking.
 *
 * **It follows the SERVER, not the browser.** The offset between the two
 * is measured once on mount and applied from then on, so a device whose
 * own clock is wrong still sees the time the game is actually keeping —
 * which is the only time that matters, because it is the one the daily
 * reset happens on. The cost is that the offset silently includes however
 * long the response took to arrive and hydrate, usually well under a
 * second and never enough to matter for a reset at a minute boundary.
 *
 * **First paint is the server's own string**, so hydration matches
 * exactly; the ticking starts in the effect afterwards. Rendering
 * `Date.now()` during the first client render is the classic way to earn
 * a hydration warning on every page in the game.
 *
 * **No live region, deliberately.** A polite live region on a clock
 * announces the time every single second, which would make the game
 * unusable with a screen reader. It is labelled and readable on demand,
 * like the clock on a wall.
 *
 * **And no countdown.** "19 minutes until reset" would be more useful and
 * is exactly the shape CLAUDE.md rules out — a timer counting down on
 * something you might miss is the fear-of-missing-out mechanic, however
 * politely it is worded. The time is information; a deadline is pressure.
 */
export function GameClock({ serverNowMs }: { serverNowMs: number }) {
  const [now, setNow] = useState(serverNowMs);

  useEffect(() => {
    const offset = serverNowMs - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [serverNowMs]);

  return (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums">
      <span className="sr-only">
        {GAME_TIME_NAME}. Everything daily changes over at midnight.{" "}
      </span>
      <span aria-hidden="true" className="font-medium">
        {GAME_TIME_LABEL}
      </span>
      <time dateTime={new Date(now).toISOString()}>{formatGameClock(now)}</time>
      {/* The date is why this is not just a clock: at 23:58 the useful
          fact is which day the dailies are still on. Hidden on the
          narrowest screens, where the footer has room for one thing. */}
      <span aria-hidden="true" className="hidden min-[400px]:inline">
        · {formatGameDate(now)}
      </span>
    </span>
  );
}
