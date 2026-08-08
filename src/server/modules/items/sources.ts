import type { DbReader } from "@/server/db";

/**
 * Where a thing comes from.
 *
 * A playtest found the dead end this closes. A request board asks a new
 * player to bring two Honey-Oat Biscuits; the item's own page told them
 * the flavour text, an estimated value, that they owned none, and that no
 * player was selling one. Nothing said a shop stocks it, or that anything
 * does — and the empty player-market section reads as "unobtainable"
 * rather than "try a shop". The game asked for a named thing and offered
 * no way to find out where the thing lived.
 *
 * **What this publishes, and what it deliberately does not.** It names
 * PLACES, never probabilities. A shop that stocks something says so; it
 * does not say how often the restock puts it out. A forage spot says the
 * thing turns up there; it does not say how often. That line is the same
 * one ADR-48 draws for the chits and the drums — what is on the ladder is
 * public, how often is not — and it is what keeps this a map rather than
 * a spreadsheet.
 *
 * It is also NOT a checklist. It answers "where would I find this?" about
 * a thing the player is already looking at. It never enumerates what they
 * are missing, never counts, and never appears as a list of things to go
 * and get (docs/design-philosophy.md; CLAUDE.md's rule that a collection
 * is whatever the player decides it is).
 */

export interface ItemSource {
  /** Short label for the kind of place, e.g. "Shop" or "Foraging". */
  kind: string;
  /** What to call it: a shop name, a spot name, an activity name. */
  name: string;
  /** Where to send the player, if there is somewhere to send them. */
  href: string | null;
  /** The place in the world, when the source has one. */
  locationName: string | null;
  /** One clause of context; never a probability. */
  detail: string;
}

/** Only published places are named — an unpublished one is not there yet. */
const PUBLISHED = { published: true, region: { published: true } } as const;

function locationHref(location: {
  slug: string;
  region: { slug: string };
}): string {
  return `/explore/${location.region.slug}/${location.slug}`;
}

/**
 * Everywhere this item comes from, in the order a player can act on:
 * things they can go and buy first, then things they can go and find,
 * then things that arrive on their own.
 */
export async function itemSources(
  db: DbReader,
  { itemId }: { itemId: string },
): Promise<ItemSource[]> {
  const [shops, forage, fishing, wheel, meal, scratch, slots] =
    await Promise.all([
      db.npcShopPoolEntry.findMany({
        where: { itemId, active: true, shop: { active: true, location: PUBLISHED } },
        include: { shop: { include: { location: { include: { region: true } } } } },
      }),
      db.forageSpotEntry.findMany({
        where: { itemId, active: true, spot: { active: true, location: PUBLISHED } },
        include: { spot: { include: { location: { include: { region: true } } } } },
      }),
      db.fishingSpotEntry.findMany({
        where: { itemId, active: true, spot: { active: true, location: PUBLISHED } },
        include: { spot: { include: { location: { include: { region: true } } } } },
      }),
      db.dailyWheelItemPoolEntry.findFirst({ where: { itemId, active: true } }),
      db.dailyFoodPoolEntry.findFirst({ where: { itemId, active: true } }),
      // A prize on a chit or a drum names the chit or the drum, which the
      // player can then read the ladder of. The ladder is already public;
      // this is the same fact approached from the other end.
      db.scratchPrize.findMany({
        where: { prizeItemId: itemId, active: true },
        include: { card: { include: { item: true } } },
      }),
      db.slotPrize.findMany({
        where: { prizeItemId: itemId, active: true },
        include: { token: { include: { item: true } } },
      }),
    ]);

  const sources: ItemSource[] = [];

  for (const entry of shops) {
    sources.push({
      kind: "Shop",
      name: entry.shop.name,
      href: locationHref(entry.shop.location),
      locationName: entry.shop.location.name,
      // Shelves are restocked from a pool, so "sometimes" is the honest
      // word. Promising it is in stock right now would send a player
      // across the map to an empty shelf.
      detail: "stocks this sometimes",
    });
  }

  for (const entry of forage) {
    sources.push({
      kind: "Foraging",
      name: entry.spot.name,
      href: locationHref(entry.spot.location),
      locationName: entry.spot.location.name,
      detail: "turns up here",
    });
  }

  for (const entry of fishing) {
    sources.push({
      kind: "Fishing",
      name: entry.spot.name,
      href: locationHref(entry.spot.location),
      locationName: entry.spot.location.name,
      detail: "can be caught here",
    });
  }

  const seenCards = new Set<string>();
  for (const prize of scratch) {
    if (seenCards.has(prize.cardItemId)) continue;
    seenCards.add(prize.cardItemId);
    sources.push({
      kind: "Prize",
      name: prize.card.item.name,
      href: `/items/${prize.card.item.slug}`,
      locationName: null,
      detail: "is one of the things under the salt",
    });
  }

  const seenTokens = new Set<string>();
  for (const prize of slots) {
    if (seenTokens.has(prize.tokenItemId)) continue;
    seenTokens.add(prize.tokenItemId);
    sources.push({
      kind: "Prize",
      name: prize.token.item.name,
      href: `/items/${prize.token.item.slug}`,
      locationName: null,
      detail: "is on this drum",
    });
  }

  if (wheel) {
    sources.push({
      kind: "Daily",
      name: "The prize wheel",
      href: "/activities",
      locationName: null,
      detail: "is one of the things the wheel gives out",
    });
  }

  if (meal) {
    sources.push({
      kind: "Daily",
      name: "The community meal",
      href: "/activities",
      locationName: null,
      detail: "is sometimes what the pot decided to be",
    });
  }

  return sources;
}
