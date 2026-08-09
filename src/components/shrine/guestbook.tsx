"use client";

import { startTransition, useActionState, useRef } from "react";
import {
  hideGuestbookEntryAction,
  signGuestbookAction,
  type GuestbookState,
} from "@/server/actions/shrine";
import type { GuestbookEntryView } from "@/server/modules/shrine/guestbook";
import { GUESTBOOK_MAX } from "@/server/modules/shrine/config";

/**
 * The guestbook (ADR-69).
 *
 * Styled from the shrine's theme rather than the app's tokens, because it
 * sits inside somebody's page and a tasteful moss-green button in the
 * middle of a Vapour-themed shrine looks like the site broke.
 *
 * Every entry is plain text and React renders it as text. The remove
 * button appears only for people the server would actually let remove it,
 * and the server checks again regardless — the flag decides what to draw,
 * never what is allowed.
 */

const INITIAL: GuestbookState = { ok: false, error: null, nonce: 0 };

const WHEN = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function Guestbook({
  shrineId,
  owner,
  entries,
  open,
  canSign,
  signedIn,
}: {
  shrineId: string;
  owner: string;
  entries: GuestbookEntryView[];
  open: boolean;
  /** False on your own shrine — the page is already your say. */
  canSign: boolean;
  signedIn: boolean;
}) {
  const [signState, sign, signing] = useActionState(
    signGuestbookAction,
    INITIAL,
  );
  const [hideState, hide] = useActionState(hideGuestbookEntryAction, INITIAL);
  const box = useRef<HTMLTextAreaElement>(null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => sign(data));
    if (box.current) box.current.value = "";
  };

  return (
    <section className="shrine-guestbook" aria-labelledby="guestbook-heading">
      <h2 id="guestbook-heading">Guestbook</h2>

      {(signState.error ?? hideState.error) && (
        <p role="alert" className="shrine-para">
          {signState.error ?? hideState.error}
        </p>
      )}
      {signState.ok && signState.nonce > 0 && (
        <p role="status" className="shrine-para">
          Signed. Thank you for visiting.
        </p>
      )}

      {open && canSign && signedIn && (
        <form onSubmit={submit} className="mb-3">
          <input type="hidden" name="shrineId" value={shrineId} />
          <input type="hidden" name="owner" value={owner} />
          <label htmlFor="guestbook-body" className="shrine-para">
            Leave a note for {owner}
          </label>
          <textarea
            id="guestbook-body"
            ref={box}
            name="body"
            rows={3}
            maxLength={GUESTBOOK_MAX}
            required
            className="shrine-field"
          />
          <button type="submit" className="shrine-button mt-2" disabled={signing}>
            {signing ? "Signing…" : "Sign the guestbook"}
          </button>
        </form>
      )}

      {open && !signedIn && (
        <p className="shrine-para shrine-quiet">
          Sign in to leave a note.
        </p>
      )}
      {!open && (
        <p className="shrine-para shrine-quiet">
          The guestbook is closed. What is already in it stays.
        </p>
      )}

      {entries.length === 0 ? (
        <p className="shrine-para shrine-quiet">
          Nobody has signed it yet. Be the first!
        </p>
      ) : (
        <ul className="list-none p-0">
          {entries.map((entry) => (
            <li key={entry.id} className="shrine-entry">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="shrine-entry-who">{entry.author}</span>
                <span className="text-xs opacity-70">
                  {WHEN.format(entry.at)}
                </span>
              </div>
              <p className="shrine-entry-body">{entry.body}</p>
              {entry.canRemove && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    startTransition(() => hide(data));
                  }}
                >
                  <input type="hidden" name="entryId" value={entry.id} />
                  <input type="hidden" name="owner" value={owner} />
                  <button type="submit" className="shrine-link mt-1 text-xs">
                    Remove this note
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
