import { moderateAction } from "@/server/actions/forums";
import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Thread-level moderator controls: lock and pin.
 *
 * Below the reply box rather than at the top, because a moderator is a
 * reader first — these are things you reach for after reading the thread,
 * not before. Removing a thread is not here: it is done by removing the
 * opening post, which is the same act and is already on that post.
 *
 * Each button is its own form so the note is submitted with the action it
 * belongs to. One shared textarea across two forms would either post an
 * empty note or need JavaScript to copy it.
 */
export function ThreadModeratorBar({
  threadId,
  locked,
  pinned,
}: {
  threadId: string;
  locked: boolean;
  pinned: boolean;
}) {
  const controls: { intent: string; label: string }[] = [
    {
      intent: locked ? "unlock-thread" : "lock-thread",
      label: locked ? "Reopen for replies" : "Close to new replies",
    },
    {
      intent: pinned ? "unpin-thread" : "pin-thread",
      label: pinned ? "Unpin from the top" : "Pin to the top",
    },
  ];

  return (
    <Surface as="section" aria-labelledby="thread-moderation" className="mt-6">
      <SectionHeading
        id="thread-moderation"
        description="Closing a thread hides nothing — everything in it stays readable."
      >
        Moderator
      </SectionHeading>
      <div className="mt-3 flex flex-col gap-4">
        {controls.map((control) => (
          <form
            key={control.intent}
            action={moderateAction}
            className="flex flex-col gap-2"
          >
            <input type="hidden" name="intent" value={control.intent} />
            <input type="hidden" name="subjectId" value={threadId} />
            <input
              type="hidden"
              name="returnTo"
              value={`/forums/t/${threadId}`}
            />
            <label
              className="text-xs text-text-muted"
              htmlFor={`${control.intent}-note`}
            >
              Note for the trail
            </label>
            <Textarea
              id={`${control.intent}-note`}
              name="reason"
              rows={2}
              maxLength={1000}
            />
            <div>
              <SubmitButton variant="secondary" pendingLabel="Working…">
                {control.label}
              </SubmitButton>
            </div>
          </form>
        ))}
      </div>
    </Surface>
  );
}
