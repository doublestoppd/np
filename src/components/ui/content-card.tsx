import Link from "next/link";
import { ArtworkFrame, type ArtworkAspect } from "./artwork-frame";

interface ContentCardProps {
  title: string;
  media: React.ReactNode;
  mediaAspect?: ArtworkAspect;
  /** Small line under the title (species, category, quantity…). */
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer row — badges, actions. */
  footer?: React.ReactNode;
  /** When set, the title becomes the card's link (full-card tap target). */
  href?: string;
  /**
   * Accessible name for the card's link when the visible title alone is
   * not enough — badges and subtitles sit outside the link, so a list of
   * cards can read as a list of bare nouns.
   */
  linkLabel?: string;
  as?: "div" | "li" | "article";
  /**
   * Heading level for the card title. Defaults to h2, the level directly
   * under a page's h1 — the hard-coded h3 made every card list skip a
   * level, and skipped it inconsistently, since the same page's empty
   * state rendered a correct h2. Pass "h3" inside a section that already
   * has its own h2.
   */
  headingAs?: "h2" | "h3";
}

/**
 * Standard media-plus-text card for inventory items, locations, and future
 * content listings. Mobile-first: full width in a single column, composes
 * into grids from `sm:` up.
 */
export function ContentCard({
  title,
  media,
  mediaAspect = "square",
  subtitle,
  children,
  footer,
  href,
  linkLabel,
  as: Tag = "div",
  headingAs: Heading = "h2",
}: ContentCardProps) {
  // Wide media (location heroes) stacks above the text so narrow grid
  // columns never squeeze titles; square media sits beside it as a thumb.
  const stacked = mediaAspect === "wide";
  return (
    <Tag
      className={`group relative flex min-w-0 gap-3 rounded-surface border border-border bg-surface p-3 transition-colors has-[a:hover]:border-border-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent ${
        stacked ? "flex-col" : ""
      }`}
    >
      <ArtworkFrame
        aspect={mediaAspect}
        className={stacked ? "w-full" : "w-20 shrink-0 self-start sm:w-24"}
      >
        {media}
      </ArtworkFrame>
      <div className="flex min-w-0 flex-1 flex-col">
        <Heading className="font-semibold break-words text-text">
          {href ? (
            <Link
              href={href}
              aria-label={linkLabel}
              className="focus:outline-none after:absolute after:inset-0"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </Heading>
        {subtitle && (
          <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
        )}
        {children && (
          <div className="mt-1 text-sm text-text-muted">{children}</div>
        )}
        {footer && (
          <div className="relative mt-auto flex flex-wrap items-center gap-2 pt-2">
            {footer}
          </div>
        )}
      </div>
    </Tag>
  );
}
