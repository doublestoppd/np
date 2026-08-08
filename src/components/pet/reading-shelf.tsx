import type { ReadingShelfView } from "@/server/modules/pets/queries";
import {
  INSIGHT_BANDS,
  insightBand,
  insightBandProgress,
} from "@/lib/pet-insight";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";

/**
 * A companion's reading: how it listens, and what it has been read.
 *
 * The heading was "<Name> has been read", and a player asked what it
 * meant. Two things were wrong. It parses as the companion being the
 * thing that was read — the passive wants a trailing "to" to be correct
 * English, which reads like a typo in a heading. And more to the point it
 * is a sentence fragment leading into a METER, so it dangles: the
 * fondness shelf gets away with "<Name> is fond of" only because a grid
 * of items follows it immediately.
 *
 * So the section heading is now a self-contained noun phrase covering
 * both halves, and the book grid has its own lead-in directly above it,
 * which is the job the section heading was failing to do.
 *
 * Unlike the fondness shelf this DOES render before the first entry, with
 * a short prompt. The difference is that reading is a thing the player
 * chooses to do and might not know is possible, whereas a delight is
 * something that happens to them; an empty shelf here is an invitation
 * rather than a reproach, and it names where the books are.
 *
 * There is deliberately no count of titles that exist, no percentage, and
 * no "next band in 40". The band is a description of the companion, not a
 * level with a bar to fill — the bar shows position within the current
 * band and reads full at the top, because a bar that can never fill is a
 * bar that always says "not yet".
 */
export function ReadingShelf({
  shelf,
  headingId,
}: {
  shelf: ReadingShelfView | null;
  headingId: string;
}) {
  if (!shelf) {
    return null;
  }
  const band = insightBand(shelf.insight);
  const progress = insightBandProgress(shelf.insight);
  const bandIndex = INSIGHT_BANDS.indexOf(band);

  return (
    <Surface as="section" aria-labelledby={headingId} className="mt-4">
      <h2 id={headingId} className="font-display text-base font-semibold">
        {shelf.petName}&apos;s reading
      </h2>

      <div className="mt-3">
        {/* No "Reading" label here: the heading two lines up already says
            it, and the band is the part worth reading. The four condition
            meters each carry a label because there are four of them under
            one heading; this is one meter under its own. The meter keeps
            its aria-label, so nothing is lost to a screen reader. */}
        <p aria-hidden="true" className="text-sm font-medium text-text">
          {band.name}
        </p>
        <div
          role="meter"
          aria-label="Reading"
          aria-valuemin={0}
          aria-valuemax={INSIGHT_BANDS.length - 1}
          aria-valuenow={bandIndex}
          aria-valuetext={`${band.name}. ${band.blurb}`}
          className="mt-1 h-3 overflow-hidden rounded-full bg-border"
        >
          <span
            className="block h-full rounded-full bg-stat-happiness transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p aria-hidden="true" className="mt-1 text-xs text-text-muted">
          {band.blurb}
        </p>
      </div>

      {shelf.titles.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">
          Nothing yet. Books are sold at{" "}
          <TextLink href="/explore/dapplewood/the-quiet-bindery">
            the Quiet Bindery
          </TextLink>
          , and reading one aloud uses it up.
        </p>
      ) : (
        <>
          <h3 className="mt-4 text-sm font-medium text-text">Has heard</h3>
          <ul className="mt-2 flex flex-wrap gap-3">
          {shelf.titles.map((entry) => (
            <li key={entry.slug} className="w-20 min-[360px]:w-24">
              <ArtworkFrame aspect="square">
                <ItemArt artKey={entry.artKey} categorySlug="books" label="" />
              </ArtworkFrame>
              <p className="mt-1 text-xs leading-tight text-text-muted">
                {entry.name}
                {/* The byline is authored, stored, and was being read out of
                    the database only to be thrown away here. A shelf of
                    books that shows no authors is a shelf of titles. */}
                {entry.author !== "" && (
                  <span className="block text-[0.7rem] opacity-80">
                    {entry.author}
                  </span>
                )}
                {entry.timesRead > 1 && (
                  <span className="block text-[0.7rem] opacity-80">
                    read {entry.timesRead} times
                  </span>
                )}
              </p>
            </li>
          ))}
            </ul>
        </>
      )}
    </Surface>
  );
}
