import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getOwnShrine } from "@/server/modules/shrine/shrine";
import { ShrineEditor } from "@/components/shrine/shrine-editor";
import { PageHeader } from "@/components/ui/page-header";
import { TextLink } from "@/components/ui/text-link";

export const metadata: Metadata = { title: "Your shrine" };

/**
 * The Shrine editor (ADR-69).
 *
 * The row is made here, on first visit, rather than at sign-up — see
 * `ensureShrine`. Opening the editor is the moment a player decided they
 * wanted one.
 */
export default async function ShrineEditorPage() {
  const user = await requireUser();
  const shrine = await getOwnShrine(prisma, user.id);

  return (
    <>
      <PageHeader
        title="Your shrine"
        description="A page of your own, decorated however you like. Nobody sees it until you say so."
        backHref="/profile"
        backLabel="Profile"
      />

      <ShrineEditor
        username={user.username}
        shrine={{
          theme: shrine.theme,
          effect: shrine.effect,
          tune: shrine.tune,
          inRing: shrine.ringJoinedAt !== null,
          banner: shrine.banner,
          blink: shrine.blink,
          body: shrine.body,
          stickers: shrine.stickers,
          published: shrine.published,
          guestbookOpen: shrine.guestbookOpen,
          visits: shrine.visits,
        }}
      />

      {shrine.published && (
        <p className="mt-4 text-sm">
          <TextLink href={`/u/${user.username}/shrine`}>
            View it the way visitors do
          </TextLink>
        </p>
      )}
    </>
  );
}
