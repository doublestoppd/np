import type { Metadata } from "next";
import { prisma } from "@/server/db";
import { requireModerator } from "@/server/auth/session";
import {
  getModerationTrail,
  getReportQueue,
} from "@/server/modules/forums/moderation";
import { moderateAction } from "@/server/actions/forums";
import { PageHeader } from "@/components/ui/page-header";
import { Surface } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { BackLink } from "@/components/ui/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { SectionHeading } from "@/components/ui/section-heading";
import { TextLink } from "@/components/ui/text-link";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { GameTimestamp } from "@/components/forums/game-timestamp";
import { firstParam, type SearchParams } from "@/lib/search-params";

export const metadata: Metadata = { title: "Moderation" };

/**
 * The open queue, and the trail.
 *
 * Authority is checked here and again inside every function this page
 * calls — including the two read-only ones, because a queue is a list of
 * things people reported in confidence.
 *
 * Each report shows what the reporter saw AND what the post says now,
 * side by side, whenever they differ. That is the whole reason the
 * snapshot exists: without it, an author who edits after being reported
 * hands the moderator a clean post and an inexplicable complaint.
 */
export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const moderator = await requireModerator();
  const params = await searchParams;
  const [queue, trail] = await Promise.all([
    getReportQueue(prisma, { role: moderator.role }),
    getModerationTrail(prisma, { role: moderator.role, limit: 20 }),
  ]);

  return (
    <>
      <BackLink href="/forums">Forums</BackLink>
      <PageHeader
        title="Moderation"
        description="Reports waiting, oldest first, and what has been done lately."
      />

      <FeedbackBanner
        notice={firstParam(params.notice)}
        error={firstParam(params.error)}
      />

      <section aria-labelledby="queue-heading">
        <SectionHeading id="queue-heading">
          {queue.length === 0
            ? "Nothing waiting"
            : `${queue.length} waiting`}
        </SectionHeading>

        {queue.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon="✓"
              headingAs="h3"
              title="The queue is empty"
              description="Nothing has been reported that hasn't been dealt with."
            />
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {queue.map((report) => (
              <li key={report.reportId}>
                <Surface density="compact">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-text-muted">
                    <span className="font-medium text-text">
                      {report.authorUsername}
                    </span>
                    <span>reported by {report.reporterUsername}</span>
                    <GameTimestamp at={report.createdAt} />
                    {report.otherOpenReports > 0 && (
                      <Badge tone="warning">
                        +{report.otherOpenReports} more
                      </Badge>
                    )}
                    {report.postVisibility !== "VISIBLE" && (
                      <Badge tone="neutral">already down</Badge>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-text-muted">
                    in{" "}
                    <TextLink href={`/forums/t/${report.threadId}`}>
                      {report.threadTitle}
                    </TextLink>
                  </p>

                  {report.reason !== "" && (
                    <p className="mt-2 whitespace-pre-wrap break-words rounded-control bg-surface-sunken p-2 text-sm text-text-muted">
                      {report.reason}
                    </p>
                  )}

                  <div className="mt-2">
                    <p className="text-xs font-medium text-text-muted">
                      {report.edited ? "As reported" : "The post"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text">
                      {report.bodyAtReport}
                    </p>
                  </div>

                  {/* Only when they differ. Showing both every time would
                      make the common case twice as long to read. */}
                  {report.edited && (
                    <div className="mt-2 rounded-control border border-warning/25 bg-warning-soft p-2">
                      <p className="text-xs font-medium text-warning">
                        Edited after it was reported — it now says:
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text">
                        {report.bodyNow}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex flex-col gap-3">
                    <form action={moderateAction} className="flex flex-col gap-2">
                      <input type="hidden" name="intent" value="remove-post" />
                      <input
                        type="hidden"
                        name="subjectId"
                        value={report.postId}
                      />
                      <input
                        type="hidden"
                        name="returnTo"
                        value="/forums/moderation"
                      />
                      <label
                        className="text-xs text-text-muted"
                        htmlFor={`up-${report.reportId}`}
                      >
                        Note for the trail
                      </label>
                      <Textarea
                        id={`up-${report.reportId}`}
                        name="reason"
                        rows={2}
                        maxLength={1000}
                      />
                      <div>
                        <SubmitButton pendingLabel="Removing…">
                          Remove the post
                        </SubmitButton>
                      </div>
                    </form>

                    <form action={moderateAction} className="flex flex-col gap-2">
                      <input
                        type="hidden"
                        name="intent"
                        value="dismiss-report"
                      />
                      <input
                        type="hidden"
                        name="subjectId"
                        value={report.reportId}
                      />
                      <input
                        type="hidden"
                        name="returnTo"
                        value="/forums/moderation"
                      />
                      <label
                        className="text-xs text-text-muted"
                        htmlFor={`dis-${report.reportId}`}
                      >
                        Why it is fine
                      </label>
                      <Textarea
                        id={`dis-${report.reportId}`}
                        name="reason"
                        rows={2}
                        maxLength={1000}
                      />
                      <div>
                        <SubmitButton
                          variant="secondary"
                          pendingLabel="Closing…"
                        >
                          Nothing wrong with it
                        </SubmitButton>
                      </div>
                    </form>
                  </div>
                </Surface>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="trail-heading" className="mt-6">
        <SectionHeading
          id="trail-heading"
          description="Every moderator action, newest first. Never shown to players."
        >
          Trail
        </SectionHeading>
        {trail.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Nothing has been done yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {trail.map((entry) => (
              <li
                key={entry.id}
                className="rounded-control border border-border bg-surface p-2 text-xs"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-text">
                    {entry.moderatorUsername}
                  </span>
                  <span className="text-text-muted">
                    {entry.type.toLowerCase().replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto text-text-muted">
                    <GameTimestamp at={entry.createdAt} />
                  </span>
                </div>
                {entry.reason !== "" && (
                  <p className="mt-1 break-words text-text-muted">
                    {entry.reason}
                  </p>
                )}
                {entry.threadId && (
                  <TextLink href={`/forums/t/${entry.threadId}`}>
                    the thread
                  </TextLink>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
