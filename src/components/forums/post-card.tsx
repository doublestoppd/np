import type { ForumPostView } from "@/server/modules/forums/queries";
import { editPostAction, withdrawPostAction, reportPostAction, moderateAction } from "@/server/actions/forums";
import { POST_BODY_MAX } from "@/lib/validation";
import { Surface } from "@/components/ui/surface";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { GameTimestamp } from "./game-timestamp";

/**
 * One post, and the things that can be done to it.
 *
 * **A post that is not visible keeps its place and loses its words.** The
 * gap is the point: a conversation with a hole in it reads as one where
 * something was said and taken back, which is what happened. Deleting the
 * row would silently renumber the replies that answer it.
 *
 * Every control is inside a `<details>`. At 360px, four buttons under
 * every post is most of the screen; folded, the conversation is the page.
 * `<details>` is also the one disclosure that needs no JavaScript, which
 * matters on a page whose forms are all plain posts to server actions.
 */
export function PostCard({
  post,
  threadId,
  threadLocked,
  isModerator,
}: {
  post: ForumPostView;
  threadId: string;
  threadLocked: boolean;
  isModerator: boolean;
}) {
  const gone = post.visibility !== "VISIBLE";
  const hasTools =
    post.canEdit || post.canWithdraw || isModerator || (!gone && !threadLocked);

  return (
    <li id={`post-${post.ordinal}`}>
      <Surface density="compact" className={gone ? "opacity-70" : ""}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-text-muted">
          <span className="font-medium text-text">{post.authorUsername}</span>
          {post.authorRole !== "PLAYER" && (
            <Badge tone="accent">
              {post.authorRole === "ADMIN" ? "staff" : "moderator"}
            </Badge>
          )}
          <GameTimestamp at={post.createdAt} />
          {post.editedAt && <span>· edited</span>}
          <span className="ml-auto">#{post.ordinal}</span>
        </div>

        {post.body === null ? (
          <p className="mt-2 text-sm italic text-text-muted">
            {post.visibility === "REMOVED"
              ? "Removed by a moderator."
              : "Withdrawn by its author."}
          </p>
        ) : (
          <>
            {gone && (
              <p className="mt-2 text-xs font-medium text-warning">
                {post.visibility === "REMOVED" ? "Removed" : "Withdrawn"} —
                visible to moderators only.
              </p>
            )}
            {/* whitespace-pre-wrap, not a markdown renderer: the body is
                stored as the player typed it and is rendered as text, so
                there is no parser between what was written and what is
                shown, and nothing to inject through. */}
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text">
              {post.body}
            </p>
          </>
        )}

        {hasTools && (
          <details className="mt-2 text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Options
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {post.canEdit && (
                <form action={editPostAction} className="flex flex-col gap-2">
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="threadId" value={threadId} />
                  <label className="sr-only" htmlFor={`edit-${post.id}`}>
                    Edit your post
                  </label>
                  <Textarea
                    id={`edit-${post.id}`}
                    name="body"
                    rows={4}
                    required
                    maxLength={POST_BODY_MAX}
                    defaultValue={post.body ?? ""}
                  />
                  <div>
                    <SubmitButton variant="secondary" pendingLabel="Saving…">
                      Save the edit
                    </SubmitButton>
                  </div>
                </form>
              )}

              {/* Two taps, on purpose. Withdrawing cannot be undone — a
                  moderator restoring an author's own withdrawal would be
                  overruling them about their own words, so the domain
                  refuses it. One mis-tap on a phone would otherwise take
                  a thread down permanently. */}
              {post.canWithdraw && (
                <details>
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    {post.ordinal === 1
                      ? "Withdraw the thread…"
                      : "Withdraw this post…"}
                  </summary>
                  <form action={withdrawPostAction} className="mt-2">
                    <input type="hidden" name="postId" value={post.id} />
                    <input type="hidden" name="threadId" value={threadId} />
                    <p className="text-xs text-text-muted">
                      {post.ordinal === 1
                        ? "This is the post the thread opens with, so withdrawing it takes the whole thread down. Replies stay as they are — they are other people's."
                        : "This takes your post out of the thread."}{" "}
                      It cannot be undone, and nobody can put it back for
                      you.
                    </p>
                    <div className="mt-2">
                      <SubmitButton
                        variant="secondary"
                        pendingLabel="Taking down…"
                      >
                        Yes, take it down
                      </SubmitButton>
                    </div>
                  </form>
                </details>
              )}

              {/* Reporting your own post is refused by the domain, so it
                  is not offered — withdrawing is right there and does what
                  they actually want. */}
              {!gone && !post.canWithdraw && (
                <form action={reportPostAction} className="flex flex-col gap-2">
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="threadId" value={threadId} />
                  <label
                    className="text-xs text-text-muted"
                    htmlFor={`report-${post.id}`}
                  >
                    Report this to a moderator (why, if you like)
                  </label>
                  <Textarea
                    id={`report-${post.id}`}
                    name="reason"
                    rows={2}
                    maxLength={1000}
                  />
                  <div>
                    <SubmitButton variant="secondary" pendingLabel="Sending…">
                      Report it
                    </SubmitButton>
                  </div>
                </form>
              )}

              {isModerator && (
                <form action={moderateAction} className="flex flex-col gap-2">
                  <input
                    type="hidden"
                    name="intent"
                    value={
                      post.visibility === "REMOVED"
                        ? "restore-post"
                        : "remove-post"
                    }
                  />
                  <input type="hidden" name="subjectId" value={post.id} />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={`/forums/t/${threadId}`}
                  />
                  <label
                    className="text-xs text-text-muted"
                    htmlFor={`mod-${post.id}`}
                  >
                    Moderator note (other moderators see this; the author
                    does not)
                  </label>
                  <Textarea
                    id={`mod-${post.id}`}
                    name="reason"
                    rows={2}
                    maxLength={1000}
                  />
                  <div>
                    <SubmitButton variant="secondary" pendingLabel="Working…">
                      {post.visibility === "REMOVED"
                        ? "Put it back"
                        : "Remove this post"}
                    </SubmitButton>
                  </div>
                </form>
              )}
            </div>
          </details>
        )}
      </Surface>
    </li>
  );
}
