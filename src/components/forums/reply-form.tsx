import { createPostAction } from "@/server/actions/forums";
import { POST_BODY_MAX } from "@/lib/validation";
import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";
import { Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { CharacterCounter } from "./character-counter";

/** Replying. A server form, like the thread composer, for the same reason. */
export function ReplyForm({ threadId }: { threadId: string }) {
  return (
    <Surface as="section" aria-labelledby="reply" className="mt-6">
      <SectionHeading id="reply">Reply</SectionHeading>
      <form action={createPostAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="threadId" value={threadId} />
        <IdempotencyField />
        <label className="sr-only" htmlFor="reply-body">
          Your reply
        </label>
        <Textarea
          id="reply-body"
          name="body"
          required
          rows={5}
          maxLength={POST_BODY_MAX}
          aria-describedby="reply-limit"
        />
        <span id="reply-limit" className="sr-only">
          Up to {POST_BODY_MAX} characters.
        </span>
        <CharacterCounter forId="reply-body" max={POST_BODY_MAX} />
        <div>
          <SubmitButton pendingLabel="Posting…">Post the reply</SubmitButton>
        </div>
      </form>
    </Surface>
  );
}
