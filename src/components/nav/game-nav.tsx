"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { isAdmin } from "@/lib/roles";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function iconPath(d: string): React.ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: iconPath("M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5"),
  },
  {
    href: "/explore",
    label: "Explore",
    icon: iconPath("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z"),
  },
  {
    href: "/games",
    label: "Games",
    icon: iconPath(
      "M6 9h4M8 7v4m7-2h.01M18 11h.01M7.2 5h9.6a4 4 0 0 1 4 3.6l.6 6.4a2.8 2.8 0 0 1-4.9 2.1L14.6 15H9.4l-1.9 2.1a2.8 2.8 0 0 1-4.9-2.1l.6-6.4a4 4 0 0 1 4-3.6Z",
    ),
  },
  {
    href: "/inventory",
    label: "Satchel",
    icon: iconPath("M4 8h16v12H4V8Zm4 0V6a4 4 0 0 1 8 0v2m-8 4h8"),
  },
  {
    href: "/forums",
    label: "Forums",
    icon: iconPath(
      "M21 12a8 8 0 0 1-8 8H4l2.5-2.5A8 8 0 1 1 21 12ZM8.5 10h7m-7 3.5h4.5",
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: iconPath("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"),
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Primary game navigation: a fixed bottom bar on small screens and a fixed
 * left sidebar from the lg breakpoint (1024 px) up.
 */
interface GameNavProps {
  /** Wallet chip from the server layout, shown in the sidebar. */
  wallet?: React.ReactNode;
  /**
   * Decides which privileged links are shown. Showing a link is all this
   * does — every page and every action behind one re-checks authority for
   * itself, because navigation is a convenience and not a permission
   * model.
   */
  role?: UserRole;
}

export function GameNav({ wallet, role = "PLAYER" }: GameNavProps) {
  const pathname = usePathname();
  const showDebug = isAdmin(role);

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface lg:flex"
      >
        <div className="px-5 py-5">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-2xl">
              🌿
            </span>
            <span className="font-display text-lg font-bold text-text">
              Glimmergrove
            </span>
          </div>
          {wallet && <div className="mt-3">{wallet}</div>}
        </div>
        <ul className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    active
                      ? "bg-accent-soft font-semibold text-accent-strong"
                      : "text-text-muted hover:bg-background hover:text-text"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {/* Admins only, and desktop only. Not because the bar is full —
            it is six tabs at 60px each on a 360px screen, measured, with
            no overflow — but because Debug is not a place you navigate to
            while playing. The compact link in the mobile header covers
            the same ground for the one account that wants it. */}
        {showDebug && (
          <div className="mt-2 border-t border-border pt-2">
            <Link
              href="/admin"
              aria-current={isActive(pathname, "/admin") ? "page" : undefined}
              className={`flex items-center gap-3 rounded-control px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isActive(pathname, "/admin")
                  ? "bg-accent-soft font-semibold text-accent-strong"
                  : "font-medium text-text-muted"
              }`}
            >
              Debug
            </Link>
          </div>
        )}
      </nav>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-bottom-nav flex-col items-center justify-center gap-0.5 text-[11px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                    active
                      ? "font-semibold text-accent-strong"
                      : "font-medium text-text-muted"
                  }`}
                >
                  {/* Active gets a soft pill behind the icon — a shape cue
                      on top of the color change, plus aria-current. */}
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-3 py-0.5 ${
                      active ? "bg-accent-soft" : ""
                    }`}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
