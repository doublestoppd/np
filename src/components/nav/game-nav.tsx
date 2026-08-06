"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    label: "Inventory",
    icon: iconPath("M4 8h16v12H4V8Zm4 0V6a4 4 0 0 1 8 0v2m-8 4h8"),
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
 * left sidebar from the md breakpoint up.
 */
export function GameNav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-stone-200 bg-white md:flex"
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <span aria-hidden="true" className="text-2xl">
            🌿
          </span>
          <span className="text-lg font-bold text-emerald-900">
            Glimmergrove
          </span>
        </div>
        <ul className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${
                    active
                      ? "bg-emerald-100 text-emerald-900"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 ${
                    active ? "text-emerald-800" : "text-stone-500"
                  }`}
                >
                  {item.icon}
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
