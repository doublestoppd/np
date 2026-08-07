/**
 * Insight bands. PURE — shared by the server and every view that shows a
 * companion's reading.
 *
 * A deliberate departure from the other four meters. Hunger, happiness,
 * energy and health are 0-100 snapshots that decay from a timestamp;
 * insight is an unbounded running total that only ever goes up. Reading is
 * something you did together, and a companion that got less clever because
 * nobody logged in for a week would be exactly the punitive mechanic
 * CLAUDE.md rules out.
 *
 * **On the names.** Every band is a compliment, including the first one. A
 * companion that has never been read to is *Curious* — which is true, and
 * is the reason you would start reading to it. There is no band that calls
 * an animal stupid, slow, or empty, because a meter that opens by
 * insulting your pet is a meter nobody wants to look at.
 *
 * The bands are also not a completion track: there is no percentage, no
 * "next band in 40", and no final band that closes the subject. Erudite is
 * simply where the names stop; the number keeps going.
 */

export interface InsightBand {
  /** Lower bound, inclusive. */
  from: number;
  name: string;
  /** One line, in the pet's favour. Shown under the meter. */
  blurb: string;
}

export const INSIGHT_BANDS: readonly InsightBand[] = [
  {
    from: 0,
    name: "Curious",
    blurb: "Attends closely to anything read aloud, and to several things that are not.",
  },
  {
    from: 40,
    name: "Attentive",
    blurb: "Has worked out that the reading stops when it wanders off, and adjusted.",
  },
  {
    from: 120,
    name: "Thoughtful",
    blurb: "Pauses at the ends of chapters. Nobody taught it where those were.",
  },
  {
    from: 280,
    name: "Well-read",
    blurb: "Recognises a book it has heard before from the sound of the cover opening.",
  },
  {
    from: 560,
    name: "Learned",
    blurb: "Has opinions about endings and makes them known by leaving the room.",
  },
  {
    from: 1_000,
    name: "Erudite",
    blurb: "Listens the way a scholar listens: patiently, and as though checking.",
  },
];

/** The band a companion's total falls in. Never null — 0 is a band. */
export function insightBand(insight: number): InsightBand {
  let band = INSIGHT_BANDS[0] as InsightBand;
  for (const candidate of INSIGHT_BANDS) {
    if (insight >= candidate.from) band = candidate;
  }
  return band;
}

/**
 * How far through the current band, 0-1, for a progress bar.
 *
 * The final band always reads full rather than growing forever toward a
 * bound that does not exist — a bar that can never fill is a bar that
 * always says "not yet".
 */
export function insightBandProgress(insight: number): number {
  const index = INSIGHT_BANDS.findIndex(
    (band) => band === insightBand(insight),
  );
  const next = INSIGHT_BANDS[index + 1];
  if (!next) return 1;
  const current = INSIGHT_BANDS[index] as InsightBand;
  const span = next.from - current.from;
  return span <= 0 ? 1 : Math.min(1, (insight - current.from) / span);
}

/**
 * What a re-read is worth, given the title's first-read value.
 *
 * A fraction, floored at 1 so a re-read is never literally pointless. The
 * shape says what the feature is about: the shelf is a list of *titles*,
 * and breadth is what teaches. It also closes the obvious loop — buying
 * one cheap book a hundred times would otherwise be the most
 * coin-efficient way to raise the meter, and grinding the same page
 * against an animal is not the activity anyone wanted to build.
 */
export const REREAD_DIVISOR = 5;

export function rereadInsight(firstReadInsight: number): number {
  return Math.max(1, Math.floor(firstReadInsight / REREAD_DIVISOR));
}
