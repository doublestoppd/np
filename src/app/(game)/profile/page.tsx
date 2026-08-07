import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { signOut, signOutEverywhere } from "@/server/actions/auth";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { CurrencyAmount } from "@/components/ui/currency-amount";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { TextLink } from "@/components/ui/text-link";
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
        actions={<LinkButton href="/profile/edit">Edit profile</LinkButton>}
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
        {/* Navigation, not page actions: a quiet link row keeps the one
            primary action (Edit profile) dominant. */}
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <TextLink href={`/u/${user.username}`}>View public profile</TextLink>
          <TextLink href="/hollow">Your Hollow</TextLink>
          <TextLink href="/shop">Your shop</TextLink>
          <TextLink href="/history">History</TextLink>
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-text-muted">Coins</dt>
            <dd className="font-semibold">
              <CurrencyAmount amount={user.coins} compact />
            </dd>
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
        <SectionHeading id="activity-heading">Recent activity</SectionHeading>
        {recentTransactions.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="🌱"
              headingAs="h3"
              title="No activity yet"
              description="Rewards, purchases, and care will show up here."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recentTransactions.map((tx) => (
              <Surface as="li" key={tx.id} density="compact">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {tx.note ?? tx.item?.name ?? tx.type}
                    </p>
                    <p className="text-xs text-text-muted">
                      {DATE_FORMAT.format(tx.createdAt)}
                    </p>
                  </div>
                  {tx.coinsDelta !== 0n && (
                    <CurrencyAmount
                      amount={tx.coinsDelta}
                      delta
                      compact
                      className="shrink-0 font-semibold"
                    />
                  )}
                </div>
              </Surface>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="session-heading" className="mt-8">
        <SectionHeading id="session-heading">This account</SectionHeading>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={signOut}>
            <SubmitButton variant="secondary" pendingLabel="Signing out…">
              Sign out
            </SubmitButton>
          </form>
          {/* The one control that helps when you think a session was
              taken: signing in again only rotates this device's token. */}
          <form action={signOutEverywhere}>
            <SubmitButton variant="quiet" pendingLabel="Signing out…">
              Sign out everywhere
            </SubmitButton>
          </form>
        </div>
        <p className="mt-2 text-sm text-text-muted">
          Signing out everywhere ends every session on every device,
          including this one.
        </p>
      </section>
    </>
  );
}
