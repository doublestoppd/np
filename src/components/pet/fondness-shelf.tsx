import type { FondnessView } from "@/server/modules/pets/queries";
import { ItemArt } from "@/components/art/item-art";
import { ArtworkFrame } from "@/components/ui/artwork-frame";
import { Surface } from "@/components/ui/surface";

/**
 * "Fond of" — the things a companion has turned out to love.
 *
 * Renders nothing at all before the first discovery: no empty state, no
 * "none yet", no prompt to go and find some. There is no schedule here and
 * nothing is owed, so there is nothing to be behind on.
 *
 * There is deliberately no count, no total, and no hint that more exist.
 * The player is never told what their companion likes — they work it out
 * by offering things — and a shelf that said "3 discovered" would turn
 * that into a checklist with an unknown denominator, which is worse than
 * a checklist.
 */
export function FondnessShelf({
  fondness,
  headingId,
}: {
  fondness: FondnessView | null;
  headingId: string;
}) {
  if (!fondness) {
    return null;
  }
  return (
    <Surface as="section" aria-labelledby={headingId} className="mt-4">
      <h2 id={headingId} className="font-display text-base font-semibold">
        {fondness.petName} is fond of
      </h2>
      <ul className="mt-3 flex flex-wrap gap-3">
        {fondness.items.map((entry) => (
          <li key={entry.slug} className="w-20 min-[360px]:w-24">
            <ArtworkFrame aspect="square">
              <ItemArt
                artKey={entry.artKey}
                categorySlug={entry.categorySlug ?? undefined}
                label=""
              />
            </ArtworkFrame>
            <p className="mt-1 text-xs leading-tight text-text-muted">
              {entry.name}
            </p>
          </li>
        ))}
      </ul>
    </Surface>
  );
}
