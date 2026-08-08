import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

/**
 * Not-found, INSIDE the game shell.
 *
 * The root `not-found.tsx` renders a bare card on an empty page: no
 * navigation, no wallet, no wordmark, one "Head home" link. That is right
 * for a signed-out stranger who mistyped the domain, and quite wrong for a
 * player who followed a stale bookmark to a renamed location — on a phone
 * it ejected them from the application entirely, with a single link out.
 *
 * A `not-found.tsx` in this route group is wrapped by the group's layout,
 * so anything under `(game)` that calls `notFound()` — a location slug
 * that no longer exists, an item that was never published, a shop that
 * closed — keeps the tab bar it arrived with.
 *
 * Genuinely unrouted paths still fall through to the root file, because
 * Next.js resolves those before any segment layout. That is the correct
 * split: one is a player who took a wrong turn inside the world, the other
 * is somebody who is not in it.
 */
export default function GameNotFound() {
  return (
    <EmptyState
      icon="🍂"
      title="Nothing here"
      description="This path leads to a patch of very ordinary leaves. Whatever you were looking for has moved, or was never quite here. Nothing is lost — everything you own is in your satchel where you left it."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/explore" className={buttonClasses("secondary")}>
            Back to the map
          </Link>
          <Link href="/" className={buttonClasses("secondary")}>
            Head home
          </Link>
        </div>
      }
    />
  );
}
