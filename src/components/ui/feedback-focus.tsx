"use client";

import { useEffect, useRef } from "react";

/**
 * Takes focus to the message an action just produced.
 *
 * Every server action here redirects, and Next resolves that as a soft
 * navigation: the document survives, so nothing re-announces the page and
 * focus falls to `<body>`. A keyboard player is thrown back to the top of
 * a two-thousand-pixel document after every feed, spin, purchase, and
 * delivery, and a sighted keyboard player simply loses the focus ring with
 * no idea where it went. Worse, the notice itself is often far above the
 * viewport — after playing with a toy the message sat 1,500px off screen,
 * so nobody saw it at all.
 *
 * Focusing the notice fixes all three at once: it puts the cursor on the
 * sentence that explains what happened, it scrolls that sentence into
 * view, and it makes the message re-readable rather than a one-shot
 * announcement. The request board already did exactly this and it was the
 * clearest moment in the game; this lifts it to every action.
 *
 * The `key` on the wrapper matters: two identical notices in a row are
 * different events, and remounting is what makes the second one land.
 */
export function FeedbackFocus({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      {children}
    </div>
  );
}
