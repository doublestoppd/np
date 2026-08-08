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
 * "Has been read" — the titles a companion has heard, and how it listens.
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
        {shelf.petName} has been read
      </h2>

      <div className="mt-3">
        <div
          aria-hidden="true"
          className="flex items-baseline justify-between gap-2 text-sm"
        >
          <span className="font-medium text-text">Reading</span>
          <span className="text-text-muted">{band.name}</span>
        </div>
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
        <ul className="mt-3 flex flex-wrap gap-3">
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
      )}
    </Surface>
  );
}
