import Link from "next/link";
import type { RingNeighbours } from "@/server/modules/shrine/webring";

/**
 * The webring navigation strip (ADR-70).
 *
 * The exact furniture every ring member carried at the bottom of the page:
 * previous, random, next, and a count. Reproduced because it is the whole
 * user interface of the idea — a ring you cannot walk is just a tag on a
 * row.
 *
 * "n of m" is a POSITION, not a rank. It is where somebody stands in the
 * order people joined, it never changes, and being 3 of 40 is not better
 * than being 31 of 40. The distinction is the reason a ring was worth
 * building instead of a most-visited list.
 */
export function RingStrip({
  ring,
  keeper,
}: {
  ring: RingNeighbours;
  keeper: string;
}) {
  return (
    <nav className="shrine-ring" aria-label="The Glimmerring">
      <p className="shrine-ring-title">
        ✦ This shrine is part of{" "}
        <Link href="/ring" className="shrine-link">
          the Glimmerring
        </Link>{" "}
        ✦
      </p>
      <p className="shrine-ring-nav">
        <Link href={`/u/${ring.previous}/shrine`} className="shrine-link">
          ← Previous
        </Link>
        {" · "}
        <Link href={`/u/${ring.random}/shrine`} className="shrine-link">
          Random
        </Link>
        {" · "}
        <Link href={`/u/${ring.next}/shrine`} className="shrine-link">
          Next →
        </Link>
      </p>
      <p className="shrine-ring-count">
        {keeper} is site {ring.position} of {ring.size}
      </p>
    </nav>
  );
}
