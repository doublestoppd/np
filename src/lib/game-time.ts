/**
 * The in-world clock.
 *
 * GST is UTC wearing a hat. Every daily thing in the game turns over at
 * midnight UTC — the word puzzle, the wheel, the meal, the slate, the
 * boards' completion caps — and until now a player had no way to see how
 * close that was without knowing their own offset from UTC and doing the
 * arithmetic. The clock is the fix; the name is flavour.
 *
 * **The name lives here and only here.** CLAUDE.md's world concept is
 * undecided, so "Glimmergrove" is a placeholder that has to stay
 * replaceable: renaming the world should be an edit to this file and the
 * prose that spells the abbreviation out, not a hunt through components.
 * The abbreviation itself is deliberately short and greppable for the
 * same reason.
 */

/** What the clock is called, in full. */
export const GAME_TIME_NAME = "Glimmergrove Standard Time";

/** What the clock is called, in the two words a footer has room for. */
export const GAME_TIME_LABEL = "GST";

/**
 * Formats an epoch millisecond value as GST, in UTC fields.
 *
 * `getUTC*` rather than `toLocaleTimeString` with a time zone: the latter
 * depends on the ICU data a browser happens to ship, and a clock that
 * quietly falls back to the viewer's own zone would be worse than no
 * clock at all — it would be a wrong clock that looks right.
 *
 * Seconds are shown so it is visibly running. A clock that only changes
 * once a minute reads as broken for the first fifty-nine seconds somebody
 * looks at it.
 */
export function formatGameClock(epochMs: number): string {
  const at = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
}

/**
 * The date the clock is on, as a person would read it — "8 August".
 *
 * Fixed to en-GB and UTC rather than the viewer's locale, because this is
 * the game's date rather than theirs: it is the date the dailies key on,
 * and it must not disagree with the time sitting next to it.
 */
export function formatGameDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
