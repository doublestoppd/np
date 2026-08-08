"use client";

import { useEffect, useState } from "react";

/**
 * "N characters left", once it is worth saying.
 *
 * Attaches to a field by id rather than controlling it, so the form
 * around it stays a plain server-rendered form that posts to a server
 * action. Without JavaScript the only thing lost is the counter — the
 * post still sends, and the browser's own `maxLength` still holds the
 * line.
 *
 * It only speaks up in the last tenth. A counter reading "0 / 8000" from
 * the first keystroke turns writing a message into filling in a form.
 *
 * `aria-hidden`, deliberately: a live counter announces on every
 * keystroke, which is unusable. The limit reaches assistive technology
 * once, as part of the field's description, which is where a limit
 * belongs.
 */
export function CharacterCounter({
  forId,
  max,
}: {
  forId: string;
  max: number;
}) {
  const [used, setUsed] = useState(0);

  useEffect(() => {
    const field = document.getElementById(forId) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (!field) return;
    const update = () => setUsed(field.value.length);
    update();
    field.addEventListener("input", update);
    return () => field.removeEventListener("input", update);
  }, [forId]);

  const left = max - used;
  if (left > Math.max(20, Math.floor(max / 10))) {
    return null;
  }
  return (
    <p aria-hidden="true" className="text-xs text-text-muted">
      {left} characters left
    </p>
  );
}
