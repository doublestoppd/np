import { createThreadAction } from "@/server/actions/forums";
import { THREAD_TITLE_MAX, POST_BODY_MAX } from "@/lib/validation";
import { Surface } from "@/components/ui/surface";
import { SectionHeading } from "@/components/ui/section-heading";
import { FormField, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { IdempotencyField } from "@/components/ui/idempotency-field";
import { CharacterCounter } from "./character-counter";

/**
 * Starting a thread.
 *
 * A server component posting to a server action, with one small client
 * island for the counter. It was briefly a client component, which pulled
 * `IdempotencyField` — and therefore `node:crypto` — into the browser
 * bundle and 500'd the whole board page. The key has to be generated on
 * the server per render anyway: that is what makes a double submit replay
 * rather than post twice.
 */
export function NewThreadForm({ boardSlug }: { boardSlug: string }) {
  return (
    <Surface as="section" aria-labelledby="new-thread" className="mt-6">
      <SectionHeading id="new-thread">Start a thread</SectionHeading>
      <form action={createThreadAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="boardSlug" value={boardSlug} />
        <IdempotencyField />
        <FormField label="Title" htmlFor="thread-title">
          <Input
            id="thread-title"
            name="title"
            required
            maxLength={THREAD_TITLE_MAX}
            aria-describedby="thread-title-limit"
          />
          <span id="thread-title-limit" className="sr-only">
            Up to {THREAD_TITLE_MAX} characters.
          </span>
          <CharacterCounter forId="thread-title" max={THREAD_TITLE_MAX} />
        </FormField>
        <FormField label="Post" htmlFor="thread-body">
          <Textarea
            id="thread-body"
            name="body"
            required
            rows={6}
            maxLength={POST_BODY_MAX}
            aria-describedby="thread-body-limit"
          />
          <span id="thread-body-limit" className="sr-only">
            Up to {POST_BODY_MAX} characters.
          </span>
          <CharacterCounter forId="thread-body" max={POST_BODY_MAX} />
        </FormField>
        <div>
          <SubmitButton pendingLabel="Posting…">Post it</SubmitButton>
        </div>
      </form>
    </Surface>
  );
}
