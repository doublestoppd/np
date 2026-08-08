import type { Scoreboard } from "@/server/modules/scoreboards/daily";
import { TextLink } from "@/components/ui/text-link";

/**
 * Today's three best at one game (ADR-67).
 *
 * Sits at the foot of the activity's own card, under a rule, so it reads
 * as a note pinned to the machine rather than as the point of it.
 *
 * **Places, not a ladder.** Three names and their scores, and no fourth
 * place, no "you are 14th", no arrow saying which way anybody moved. A
 * player who is not on it is told what today's best is and nothing about
 * where they stand relative to it — which is the difference between a
 * thing to aim at and a thing to be measured by.
 *
 * It empties at midnight GST with everything else that resets, so the
 * board is always a day old at most and nobody has to defend a position.
 */

const PLACES = ["🥇", "🥈", "🥉"];

export function TodaysBest({
  board,
  /** What the game calls a go, for the empty state: "flight", "climb". */
  attempt,
  /**
   * Unique per board. A location may host more than one scoring activity,
   * and two sections labelled by the same id is an accessibility bug that
   * looks like nothing at all on screen.
   */
  headingId,
}: {
  board: Scoreboard;
  attempt: string;
  headingId: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 border-t border-border pt-3"
    >
      <h3 id={headingId} className="text-sm font-semibold text-text">
        Today&apos;s best
      </h3>

      {board.rows.length === 0 ? (
        <p className="mt-1 text-sm text-text-muted">
          Nobody has posted a score today. The first {attempt} that goes
          anywhere takes the top of it.
        </p>
      ) : (
        <>
          <ol className="mt-2 space-y-1">
            {board.rows.map((row) => (
              <li
                key={row.username}
                // Wrapping, and the score never split across lines. A long
                // username plus the marker is more than 360px holds, and
                // "28" on one line over "walls" on the next reads as two
                // numbers rather than one score.
                className={`flex flex-wrap items-baseline gap-x-2 text-sm ${
                  row.isViewer ? "font-semibold text-text" : "text-text-muted"
                }`}
              >
                <span aria-hidden="true">{PLACES[row.place - 1]}</span>
                {/* Named and linked, both ways: a board of names nobody can
                    look up is a wall of strangers. */}
                <TextLink href={`/u/${row.username}`}>{row.username}</TextLink>
                <span className="whitespace-nowrap tabular-nums">
                  {row.score} {row.score === 1 ? board.unit[0] : board.unit[1]}
                </span>
                {row.isViewer && (
                  <span className="text-xs font-normal text-text-muted">
                    that&apos;s you
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-text-muted">
            Resets at midnight GST.
          </p>
        </>
      )}
    </section>
  );
}
