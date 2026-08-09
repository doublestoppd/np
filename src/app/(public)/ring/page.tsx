import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { randomRingMember, ringSize } from "@/server/modules/shrine/webring";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = { title: "The Glimmerring" };

/**
 * The ring's front door (ADR-70).
 *
 * **Deliberately not a directory.** There is no list of members, no
 * ordering by anything, no "recently updated" and no count of anybody's
 * visitors. It says how many pages are in the ring and sends you into it
 * at a random one, which is the only entrance a ring ever had.
 *
 * A list would be a leaderboard the moment it had a column, and the whole
 * reason a ring is the right shape for this is that it has no front.
 */
export default async function RingPage() {
  const [size, entry] = await Promise.all([
    ringSize(prisma),
    randomRingMember(prisma),
  ]);

  return (
    <>
      <PageHeader
        title="The Glimmerring"
        description="Shrines linked in a circle. Every page carries a strip to the one before it and the one after, and the only way round is to walk it."
      />

      {size === 0 || !entry ? (
        <EmptyState
          title="Nobody has joined yet"
          description="Decorate a shrine, open it to visitors, and tick “join the Glimmerring” to be the first link in it."
        />
      ) : (
        <Surface as="section" className="text-center">
          <p className="font-display text-3xl font-bold tabular-nums text-accent-strong">
            {size}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            {size === 1 ? "shrine in the ring" : "shrines in the ring"}
          </p>
          <p className="mt-4">
            <TextLink href={`/u/${entry}/shrine`} className="font-medium">
              Step into the ring →
            </TextLink>
          </p>
          <p className="mt-2 text-xs text-text-muted">
            You will land on one at random. There is no first page and no
            last one.
          </p>
        </Surface>
      )}

      <p className="mt-4 text-sm">
        <TextLink href="/profile/shrine">Your own shrine</TextLink>
      </p>
    </>
  );
}
