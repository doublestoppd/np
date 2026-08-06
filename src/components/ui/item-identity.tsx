import Link from "next/link";
import type { Rarity } from "@prisma/client";
import { ArtworkFrame } from "./artwork-frame";
import { RarityBadge } from "./rarity-badge";

interface ItemIdentityProps {
  name: string;
  /** Artwork node (ItemArt). The frame and sizing are owned here. */
  art: React.ReactNode;
  /** Links the item name to its detail page. */
  href?: string;
  /** sm = dense management rows, md = browsing/purchase rows. */
  size?: "sm" | "md";
  rarity?: Rarity;
  /** Extra badges after rarity (e.g. "One of a kind"). */
  badges?: React.ReactNode;
  /** Secondary line: category, stack quantity, provenance, stock. */
  meta?: React.ReactNode;
  /** Price line — always rendered in the same position under meta. */
  price?: React.ReactNode;
  /** Action area (buy/feed/list forms). Kept clear of the artwork. */
  action?: React.ReactNode;
  /** Heading element for the name; pages pick their outline level. */
  headingAs?: "h2" | "h3" | "p";
  as?: "li" | "div" | "article";
  className?: string;
}

const ART_WIDTHS = { sm: "w-14", md: "w-16 sm:w-20" } as const;

/**
 * The one item identity block: artwork and name first, rarity and
 * metadata secondary, price in a consistent position, one action area.
 * Every surface that shows an item row (NPC shops, player shops, item
 * detail listings, management lists, reward reveals) composes this
 * instead of hand-rolling its own arrangement.
 */
export function ItemIdentity({
  name,
  art,
  href,
  size = "md",
  rarity,
  badges,
  meta,
  price,
  action,
  headingAs: Heading = "h3",
  as: Tag = "div",
  className = "",
}: ItemIdentityProps) {
  return (
    <Tag
      className={`flex gap-3 rounded-surface border border-border bg-surface p-3 ${className}`.trim()}
    >
      <ArtworkFrame
        aspect="square"
        className={`${ART_WIDTHS[size]} shrink-0 self-start`}
      >
        {art}
      </ArtworkFrame>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Heading className="font-semibold break-words text-text">
            {href ? (
              <Link
                href={href}
                className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </Heading>
          {rarity && <RarityBadge rarity={rarity} />}
          {badges}
        </div>
        {meta && <p className="mt-0.5 text-xs text-text-muted">{meta}</p>}
        {price && (
          <p className="mt-1 text-sm font-medium text-text">{price}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </Tag>
  );
}
