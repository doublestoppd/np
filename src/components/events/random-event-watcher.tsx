"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  rollRandomEventAction,
  type RandomEventPresentation,
} from "@/server/actions/events";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * Asks the server for a random-event roll once per completed, visible page
 * view. It asks; it never decides.
 *
 * How each requirement is actually met:
 *
 * - **Prefetch-safe by construction.** Next prefetches an RSC payload
 *   without mounting the tree, so this effect cannot run for a route the
 *   player has not navigated to. There is nothing to opt out of.
 * - **Never on a failed load.** The effect belongs to the rendered route
 *   subtree; a navigation that errors renders the error boundary instead
 *   and this never mounts for it.
 * - **Visible loads only.** A background tab restoring, or a navigation in
 *   a hidden tab, waits for `visibilitychange` rather than rolling at a
 *   moment the player cannot see.
 * - **Once per page view.** A ref keyed on the pathname survives React's
 *   development double-effect. The server's anti-duplicate window is the
 *   real guarantee; this just avoids the wasted request.
 * - **Failures are silent.** A roll is a garnish on a page the player
 *   already has. A network error must never become something to read.
 */
export function RandomEventWatcher() {
  const pathname = usePathname();
  const router = useRouter();
  const [event, setEvent] = useState<RandomEventPresentation | null>(null);
  const requestedFor = useRef<string | null>(null);

  const roll = useCallback(
    async (path: string) => {
      if (requestedFor.current === path) return;
      requestedFor.current = path;
      try {
        const result = await rollRandomEventAction({
          routePath: path,
          idempotencyKey: crypto.randomUUID(),
        });
        if (result.event) {
          setEvent(result.event);
          // Rewards were applied server-side; refresh so the wallet chip
          // and any affected page data catch up. The client never adds a
          // coin or an item of its own.
          router.refresh();
        }
      } catch {
        // Deliberately swallowed — see the note above.
      }
    },
    [router],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (document.visibilityState === "visible") {
      void roll(pathname);
      return;
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void roll(pathname);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [pathname, roll]);

  return (
    <Modal
      open={event !== null}
      onClose={() => setEvent(null)}
      labelledBy="random-event-title"
    >
      {event && (
        <div className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {RARITY_LABELS[event.rarity] ?? "Something happened"}
          </p>
          <h2
            id="random-event-title"
            className="mt-1 font-display text-xl font-bold text-text"
          >
            {event.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-text">
            {event.message}
          </p>

          {event.rewardSummary !== "" && (
            <p className="mt-4 rounded-control border border-border bg-background px-3 py-2 text-sm font-medium text-text">
              You received {event.rewardSummary}.
            </p>
          )}
          {event.effects.some((effect) => effect.kind === "petStat") && (
            <p className="mt-2 text-sm text-text-muted">
              Your companion is a little different for it.
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={() => setEvent(null)}>
              Carry on
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const RARITY_LABELS: Record<string, string> = {
  common: "A small moment",
  uncommon: "An uncommon moment",
  rare: "A rare find",
  legendary: "An extraordinary find",
};
