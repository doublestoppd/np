import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireAdmin } from "@/server/auth/session";
import { adminGrantCoinsAction, adminResetAction } from "@/server/actions/admin";
import { getPlayerSnapshot } from "@/server/modules/admin/debug";
import { runReconciliation } from "@/server/modules/admin/reconciliation";
import { currentGameDate } from "@/server/modules/daily/game-day";
import { formatCoins } from "@/lib/money";
import { ROLE_LABELS } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { Surface } from "@/components/ui/surface";
import { FormField, Input } from "@/components/ui/field";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Debug" };

/**
 * The administrator's debug screen.
 *
 * Built for the person testing the game by hand: the limits that exist to
 * bound automation are exactly the limits that make manual testing
 * tedious, and waiting for midnight to try a daily again is not a good
 * use of anybody's evening.
 *
 * Authority is checked HERE and again inside every action. A page that is
 * merely unlinked is not a permission model.
 *
 * Everything on this screen is scoped to one named player, defaulting to
 * the administrator themselves, so a mis-click lands on your own account
 * rather than a stranger's.
 */
export default async function AdminDebugPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const requested = firstParam(params.username)?.trim();
  const username = requested && requested.length > 0 ? requested : admin.username;

  const [snapshot, findings, recentAdminEvents] = await Promise.all([
    getPlayerSnapshot(prisma, { username }),
    runReconciliation(prisma, {}),
    prisma.securityEvent.findMany({
      where: { type: "admin-action" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Debug"
        description="Tools for testing the game by hand. Everything here is scoped to one player and written to the audit log."
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      {/* ---- Who and when ------------------------------------------- */}
      <Surface as="section" raised className="mb-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-text-muted">Game date</dt>
            <dd className="font-medium tabular-nums text-text">
              {currentGameDate()}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Server time (UTC)</dt>
            <dd className="font-medium tabular-nums text-text">
              {new Date().toISOString().slice(11, 19)}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Signed in as</dt>
            <dd className="font-medium text-text">{admin.username}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Reconciliation</dt>
            <dd className="font-medium text-text">
              {findings.length === 0 ? (
                <Badge tone="success">clean</Badge>
              ) : (
                <Badge tone="warning">{findings.length} finding(s)</Badge>
              )}
            </dd>
          </div>
        </dl>
      </Surface>

      {/* ---- Pick a player ------------------------------------------- */}
      <section aria-labelledby="who-heading" className="mb-5">
        <SectionHeading id="who-heading">Player</SectionHeading>
        <Surface className="mt-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <FormField label="Username" htmlFor="admin-username">
                <Input
                  id="admin-username"
                  name="username"
                  defaultValue={username}
                  autoComplete="off"
                />
              </FormField>
            </div>
            <Button type="submit" variant="secondary">
              Look up
            </Button>
          </form>

          {!snapshot ? (
            <InlineNotice tone="warning" className="mt-3">
              No account called &ldquo;{username}&rdquo;.
            </InlineNotice>
          ) : (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-text-muted">Coins</dt>
                <dd className="font-medium tabular-nums text-text">
                  {formatCoins(BigInt(snapshot.coins))}
                </dd>
              </div>
              <div>
                <dt className="text-text-muted">Joined</dt>
                <dd className="font-medium text-text">
                  {snapshot.createdAt.toISOString().slice(0, 10)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-text-muted">Companions</dt>
                <dd className="font-medium text-text">
                  {snapshot.pets.length === 0
                    ? "none"
                    : snapshot.pets
                        .map(
                          (pet) =>
                            `${pet.name} (${pet.species}, ${pet.insight} insight)`,
                        )
                        .join(" · ")}
                </dd>
              </div>
              {snapshot.role !== "PLAYER" && (
                <div className="col-span-2">
                  <Badge tone="accent">
                    {ROLE_LABELS[snapshot.role].toLowerCase()}
                  </Badge>
                </div>
              )}
            </dl>
          )}
        </Surface>
      </section>

      {/* ---- The flagship: reset the limits --------------------------- */}
      {snapshot && (
        <section aria-labelledby="reset-heading" className="mb-5">
          <SectionHeading
            id="reset-heading"
            description="Two levels, because one of them touches the economy and the other does not."
          >
            Reset limits
          </SectionHeading>

          <Surface className="mt-3">
            <h3 className="text-sm font-semibold text-text">
              Clear throttles
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              Rate-limit windows, idempotency keys, the random-event
              cooldown, and per-toy play cooldowns. Nothing here has ever
              paid anybody, so this cannot pay anybody twice — press it as
              often as you like.
            </p>
            <form action={adminResetAction} className="mt-3">
              <input type="hidden" name="username" value={snapshot.username} />
              <input type="hidden" name="scope" value="throttles" />
              <Button type="submit" variant="secondary">
                Clear throttles for {snapshot.username}
              </Button>
            </form>

            <hr className="my-4 border-border" />

            <h3 className="text-sm font-semibold text-text">
              Rewind today
            </h3>
            <p className="mt-1 text-sm text-text-muted">
              Also clears today&rsquo;s completions, so every daily can be
              played again. This is a <strong>rewind, not a top-up</strong>
              : coins today&rsquo;s activities paid are taken back and their
              ledger rows removed, so playing the day again earns the same
              coins rather than a second set. Items already granted are not
              taken back.
            </p>
            <p className="mt-2 text-sm text-text-muted">
              If the player has already spent today&rsquo;s earnings the
              rewind is refused outright, because clamping it would leave
              the ledger lying.
            </p>
            <form action={adminResetAction} className="mt-3">
              <input type="hidden" name="username" value={snapshot.username} />
              <input type="hidden" name="scope" value="today" />
              <Button type="submit">
                Rewind today for {snapshot.username}
              </Button>
            </form>
          </Surface>
        </section>
      )}

      {/* ---- Coins --------------------------------------------------- */}
      {snapshot && (
        <section aria-labelledby="coins-heading" className="mb-5">
          <SectionHeading
            id="coins-heading"
            description="The only tool here that makes coins rather than moving them. Use it to reach a price you want to test, not to play."
          >
            Grant coins
          </SectionHeading>
          <Surface className="mt-3">
            <p className="text-sm text-text-muted">
              Credits the wallet and writes the matching ledger row in one
              transaction, so the reconciliation check above stays clean. The
              player sees it in their history as an adjustment — it is not a
              secret from them.
            </p>
            <form
              action={adminGrantCoinsAction}
              className="mt-3 flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="username" value={snapshot.username} />
              <div className="w-32">
                <FormField label="Amount" htmlFor="admin-grant-amount">
                  <Input
                    id="admin-grant-amount"
                    name="amount"
                    // A number field with a step and bounds, so a phone
                    // offers the numeric keypad and the browser refuses a
                    // fraction before the server has to.
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1_000_000_000}
                    step={1}
                    defaultValue={1000}
                    required
                    autoComplete="off"
                    className="tabular-nums"
                  />
                </FormField>
              </div>
              <Button type="submit" variant="secondary">
                Grant to {snapshot.username}
              </Button>
            </form>
            <p className="mt-2 text-xs text-text-muted">
              There is no matching &ldquo;take back&rdquo;: a debit has to be
              guarded against a wallet that has already spent the money, and a
              tool that can leave the ledger lying is worse than one that only
              goes up.
            </p>
          </Surface>
        </section>
      )}

      {/* ---- What is currently in the way ---------------------------- */}
      {snapshot && (
        <section aria-labelledby="state-heading" className="mb-5">
          <SectionHeading id="state-heading">In the way right now</SectionHeading>
          <Surface className="mt-3">
            <h3 className="text-sm font-semibold text-text">
              Spent today ({snapshot.gameDate})
            </h3>
            {snapshot.spentToday.length === 0 ? (
              <p className="mt-1 text-sm text-text-muted">
                Nothing yet — every daily is still available.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-text-muted">
                {snapshot.spentToday.map((row) => (
                  <li key={row.activity}>
                    <span className="text-text">{row.activity}</span> —{" "}
                    {row.detail}
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-4 text-sm font-semibold text-text">
              Live throttles
            </h3>
            {snapshot.throttles.length === 0 ? (
              <p className="mt-1 text-sm text-text-muted">
                No rate-limit windows open.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-text-muted">
                {snapshot.throttles.map((row) => (
                  <li key={`${row.rule}-${row.windowStart.toISOString()}`}>
                    <span className="text-text">{row.rule}</span> — {row.count}{" "}
                    since {row.windowStart.toISOString().slice(11, 19)}
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </section>
      )}

      {/* ---- Reconciliation ------------------------------------------ */}
      <section aria-labelledby="recon-heading" className="mb-5">
        <SectionHeading
          id="recon-heading"
          description="The economy invariants, checked across every account on every load of this page."
        >
          Reconciliation
        </SectionHeading>
        <Surface className="mt-3">
          {findings.length === 0 ? (
            <p className="text-sm text-text-muted">
              No findings. Wallets, ledgers, escrow, and every feature&rsquo;s
              payout records agree.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {findings.slice(0, 25).map((finding, index) => (
                <li key={`${finding.check}-${finding.subject}-${index}`}>
                  <Badge tone="warning">{finding.check}</Badge>{" "}
                  <span className="text-text-muted">
                    {finding.subject} — {finding.detail}
                  </span>
                </li>
              ))}
              {findings.length > 25 && (
                <li className="text-text-muted">
                  …and {findings.length - 25} more. Run{" "}
                  <code>npx tsx scripts/reconcile.ts</code> for the full list.
                </li>
              )}
            </ul>
          )}
        </Surface>
      </section>

      {/* ---- The audit trail ----------------------------------------- */}
      <section aria-labelledby="audit-heading">
        <SectionHeading
          id="audit-heading"
          description="Every administrative action, including the ones taken from this page."
        >
          Recent admin actions
        </SectionHeading>
        <Surface className="mt-3">
          {recentAdminEvents.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentAdminEvents.map((event) => (
                <li key={event.id}>
                  <span className="tabular-nums text-text-muted">
                    {event.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                  </span>{" "}
                  <span className="text-text">{event.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      </section>
    </>
  );
}
