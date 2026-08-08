import { formatGameClock, formatGameDate, GAME_TIME_LABEL } from "@/lib/game-time";

/**
 * When something was posted, in the game's own clock.
 *
 * Absolute rather than relative ("3 hours ago"), for two reasons. A
 * relative label has to be computed against *now*, which the server and
 * the client disagree about by however long the response took — so it
 * either mismatches at hydration or needs the same offset dance the
 * footer clock does, on every timestamp on the page. And it is no longer
 * the more readable option: there is a GST clock in the footer of every
 * screen now, so "8 August 14:32 GST" is something a player can actually
 * compare against.
 *
 * The year is omitted deliberately. It is pre-alpha; nothing here is old
 * enough for the year to be the interesting part, and adding it to every
 * post costs the width that the username needs at 360px.
 */
export function GameTimestamp({ at }: { at: Date }) {
  const ms = at.getTime();
  return (
    <time dateTime={at.toISOString()} className="tabular-nums">
      {formatGameDate(ms)} {formatGameClock(ms).slice(0, 5)}
      <span className="sr-only"> {GAME_TIME_LABEL}</span>
    </time>
  );
}
