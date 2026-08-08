import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Glimmergrove",
    template: "%s · Glimmergrove",
  },
  description:
    "Adopt an original companion, keep it fed and happy, and explore together.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover makes env(safe-area-inset-*) real on notched
  // devices, so the bottom navigation clearance tokens can respect it.
  viewportFit: "cover",
  // Matches --color-background in globals.css (the browser chrome tint).
  themeColor: "#f4efe6",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-text antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-control focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent focus:shadow-surface"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
