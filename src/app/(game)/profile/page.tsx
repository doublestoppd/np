import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { signOut } from "@/server/actions/auth";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { Surface } from "@/components/ui/surface";

export const metadata: Metadata = { title: "Profile" };

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ProfilePage() {
  const user = await requireUser();

  const [profile, petCount, recentTransactions] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user.id } }),
    prisma.pet.count({ where: { ownerId: user.id } }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { item: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Profile"
        description="How the grove sees you."
        actions={
          <>
            <LinkButton href={`/u/${user.username}`} variant="secondary">
              View public profile
            </LinkButton>
            <LinkButton href="/profile/edit">Edit profile</LinkButton>
          </>
        }
      />

      <Surface as="section" raised aria-labelledby="account-heading">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 id="account-heading" className="font-display text-lg font-semibold">
            {user.username}
          </h2>
          {profile?.title && <Badge tone="accent">{profile.title}</Badge>}
        </div>
        {profile?.bio ? (
          <p className="mt-2 max-w-prose whitespace-pre-line text-sm text-text-muted">
            {profile.bio}
          </p>
        ) : (
          <p className="mt-2 text-sm text-text-muted">
            No bio yet — add one in the editor.
          </p>
        )}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-text-muted">Coins</dt>
            <dd className="font-semibold tabular-nums">{user.coins}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Companions</dt>
            <dd className="font-semibold tabular-nums">{petCount}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-text-muted">Member since</dt>
            <dd className="font-semibold">
              {DATE_FORMAT.format(user.createdAt)}
            </dd>
          </div>
        </dl>
      </Surface>

      <section aria-labelledby="activity-heading" className="mt-6">
        <h2 id="activity-heading" className="font-display text-lg font-semibold">
          Recent activity
        </h2>
        {recentTransactions.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No activity yet" />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recentTransactions.map((tx) => (
              <Surface as="li" key={tx.id} padded={false} className="p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {tx.note ?? tx.item?.name ?? tx.type}
                    </p>
                    <p className="text-xs text-text-muted">
                      {DATE_FORMAT.format(tx.createdAt)}
                    </p>
                  </div>
                  {tx.coinsDelta !== 0 && (
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        tx.coinsDelta > 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      {tx.coinsDelta > 0 ? "+" : ""}
                      {tx.coinsDelta}
                    </span>
                  )}
                </div>
              </Surface>
            ))}
          </ul>
        )}
      </section>

      <form action={signOut} className="mt-8">
        <SubmitButton variant="secondary" pendingLabel="Signing out…">
          Sign out
        </SubmitButton>
      </form>
    </>
  );
}
