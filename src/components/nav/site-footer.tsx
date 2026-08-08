import Link from "next/link";
import { GameClock } from "./game-clock";

/**
 * The quiet line at the bottom of every screen.
 *
 * It exists for one reason: the item artwork is used under CC BY 3.0,
 * which asks for attribution, and attribution has to be somewhere a person
 * can actually get to. A credit buried in a repository file is not one.
 *
 * Deliberately one link and nothing else — no social row, no newsletter,
 * no second navigation. The bottom of a page on a phone is where the
 * thumb rests, and it belongs to the game's own navigation.
 */
export function SiteFooter({
  /**
   * True inside the game shell, where a fixed bottom navigation bar
   * overlays the end of the page. The clearance has to live on whatever is
   * genuinely last in the flow, and that is now this — put it only on
   * `<main>` and the footer lands underneath the bar, where a browser test
   * found the link visible, reachable by keyboard, and impossible to tap.
   */
  clearsBottomNav = false,
}: {
  clearsBottomNav?: boolean;
} = {}) {
  return (
    <footer
      className={`mx-auto flex w-full max-w-3xl flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 text-xs text-text-muted ${
        clearsBottomNav ? "pb-nav-clearance lg:pb-10" : "pb-6"
      }`}
    >
      <Link
        href="/credits"
        className="rounded-sm underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Credits
      </Link>
      {/* The server's clock. Here rather than in the navigation because
          the footer had one link in it and the bar at 360px is already
          five tabs and a wallet — and because a clock is something you
          look for when you want it, not something that should sit in the
          way while you play. */}
      <GameClock serverNowMs={Date.now()} />
    </footer>
  );
}
