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

/**
 * Browsing rows lead with the artwork, so `md` is sized to hold its own
 * against the text beside it rather than sit in the corner as a thumbnail.
 * `sm` stays a thumbnail — dense management lists are scanned by name.
 *
 * The step is at 360px, the supported floor (CLAUDE.md), not at Tailwind's
 * `sm`. Below the floor the wide artwork leaves too little room for the
 * name and long ones break mid-word; at and above it, names fit on one
 * line and the artwork roughly matches the height of the text beside it.
 */
const ART_WIDTHS = {
  sm: "w-14",
  md: "w-20 min-[360px]:w-28 sm:w-32",
} as const;

/**
 * The one item identity block: artwork and name first, rarity and
 * metadata secondary, price in a consistent position, one action area.
 * Every surface that shows an item row (NPC shops, player shops, item
 * detail listings, management lists, reward reveals) composes this
 * instead of hand-rolling its own arrangement.
 *
 * Layout: artwork beside the identity text, and the action on its own
 * full-width row underneath. Keeping the action in the text column made
 * that column much taller than the artwork, which left an empty rectangle
 * under the art on narrow screens, and squeezed quantity-plus-button forms
 * into half the card. Rarity sits on its own line under the name for the
 * same reason it is not a suffix: it qualifies the item, it does not
 * continue its name, and sharing a wrapping row with a long name split it
 * unpredictably.
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
      className={`flex flex-col gap-3 rounded-surface border border-border bg-surface p-3 ${className}`.trim()}
    >
      <div className="flex gap-3">
        <ArtworkFrame
          aspect="square"
          className={`${ART_WIDTHS[size]} shrink-0 self-start`}
        >
          {art}
        </ArtworkFrame>
        <div className="flex min-w-0 flex-1 flex-col">
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
          {(rarity || badges) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {rarity && <RarityBadge rarity={rarity} />}
              {badges}
            </div>
          )}
          {meta && <p className="mt-1 text-xs text-text-muted">{meta}</p>}
          {price && (
            <p className="mt-1 text-sm font-medium text-text">{price}</p>
          )}
        </div>
      </div>
      {action}
    </Tag>
  );
}
