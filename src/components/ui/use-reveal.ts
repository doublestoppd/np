"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Brings a panel into view when it opens.
 *
 * Both minigames put their board a long way down the page, below the
 * controls that open it. On a 360x740 phone that is two screens away, so
 * tapping "Easy" or "Start sorting" changed nothing above the fold and the
 * game looked broken — a first-time player pressed the button twice and
 * assumed it had failed. The board had loaded perfectly, 1,200 pixels down.
 *
 * Only fires on the transition into open, never on mount: arriving at a
 * page with a run already in progress should not yank the viewport around
 * before the player has looked at anything.
 */
export function useRevealOnOpen<T extends HTMLElement>(
  open: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (open && !wasOpen.current && ref.current) {
      const reduced = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      ref.current.scrollIntoView({
        block: "start",
        behavior: reduced ? "auto" : "smooth",
      });
    }
    wasOpen.current = open;
  }, [open]);

  return ref;
}
