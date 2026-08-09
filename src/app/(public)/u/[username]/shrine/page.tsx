import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { getPublicProfile } from "@/server/modules/profiles/profile";
import { countVisit, getPublicShrine } from "@/server/modules/shrine/shrine";
import { getGuestbook } from "@/server/modules/shrine/guestbook";
import { clientOriginHash } from "@/server/security/request-context";
import { ShrinePage } from "@/components/shrine/shrine-page";
import { Guestbook } from "@/components/shrine/guestbook";
import { TextLink } from "@/components/ui/text-link";

/** Shared with the metadata, like the profile and the Hollow it sits beside. */
const loadProfile = cache((username: string) =>
  getPublicProfile(prisma, username),
);

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  return { title: profile ? `${profile.username}'s shrine` : "A shrine" };
}

/**
 * Somebody's Shrine (ADR-69).
 *
 * Public, and viewable signed out — which is half the point of a page you
 * decorate. An unpublished shrine renders as not-found rather than as
 * "this exists but you can't see it", so a half-built page is not
 * something strangers can tell is there.
 */
export default async function PublicShrinePage({ params }: Props) {
  const { username } = await params;
  const [profile, viewer] = await Promise.all([
    loadProfile(username),
    getCurrentUser(),
  ]);
  if (!profile) notFound();

  const shrine = await getPublicShrine(prisma, { username });
  if (!shrine) notFound();

  /*
   * The counter ticks on render, because a page view IS the event and
   * there is nowhere else to put it.
   *
   * **It counts who it can honestly tell apart, and nobody else.** A
   * signed-in viewer counts by id. A signed-out one counts by hashed
   * origin — but that is null unless the app is behind a proxy it trusts,
   * and `clientOriginHash` is explicit that a constant must never be
   * substituted for null. So an anonymous viewer the server cannot
   * distinguish from the next one is simply not counted.
   *
   * That is the honest reading of a number, and it is also the only one
   * that cannot be farmed: a fallback would make the counter a tally of
   * page loads from anyone with a private window, which is precisely the
   * lie every counter of this kind told.
   *
   * The owner never counts as their own visitor.
   */
  const viewerKey = viewer?.id ?? (await clientOriginHash());
  if (viewerKey && viewer?.id !== shrine.userId) {
    await countVisit(prisma, { shrineId: shrine.id, viewerKey });
  }

  const entries = await getGuestbook(prisma, {
    shrineId: shrine.id,
    viewerId: viewer?.id ?? null,
    viewerRole: viewer?.role ?? null,
    ownerId: shrine.userId,
  });

  // Read back after the tick so the number a visitor sees includes them —
  // "you are visitor 41" reading 40 is the one thing a counter cannot do.
  const visits = await prisma.shrine
    .findUnique({ where: { id: shrine.id }, select: { visits: true } })
    .then((row) => row?.visits ?? shrine.visits);

  return (
    <>
      <ShrinePage
        shrine={{
          theme: shrine.theme,
          banner: shrine.banner,
          blink: shrine.blink,
          body: shrine.body,
          stickers: shrine.stickers,
          visits,
          keeper: profile.username,
        }}
      >
        <Guestbook
          shrineId={shrine.id}
          owner={profile.username}
          entries={entries}
          open={shrine.guestbookOpen}
          canSign={viewer?.id !== shrine.userId}
          signedIn={Boolean(viewer)}
        />
      </ShrinePage>

      <p className="mt-4 text-sm">
        <TextLink href={`/u/${profile.username}`}>
          Back to {profile.username}&apos;s profile
        </TextLink>
      </p>
    </>
  );
}
