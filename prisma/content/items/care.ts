import type { ItemContent, RemedyContent } from "../schemas";

/**
 * Remedies and grooming tools (ADR-60).
 *
 * The two halves of the care shop, and they are priced on opposite
 * principles, deliberately:
 *
 * **Remedies are cheap and consumed.** They buy IMPATIENCE, not health —
 * every ailment ends on its own within a day or two, so what a remedy
 * actually sells is not having to wait. Pricing them like medicine a
 * companion needs would be selling a problem the game invented, which is
 * the shape CLAUDE.md's no-pay-to-win rule exists to prevent. A specific
 * remedy is a few coins; the broad tonic that settles anything costs more
 * because it saves a walk, not because it works better.
 *
 * **Grooming tools are dearer and kept forever.** A brush is a possession,
 * like a toy — buy it once and it works for the life of the companion, on
 * a per-tool cooldown. So the coat is sustained by OWNING A FEW rather
 * than by spending weekly, and a player who buys three brushes early is
 * finished shopping for grooming for good.
 */
export const careItems = [
  // ---- Remedies -------------------------------------------------------
  {
    slug: "hedgerow-syrup",
    name: "Hedgerow Syrup",
    description:
      "Thick, dark, and startlingly sweet. Settles a cough in about the time it takes to explain that it will.",
    type: "REMEDY",
    category: "remedies",
    tags: ["brewed", "sweet"],
    price: 34n,
    rarity: "COMMON",
    artKey: "hedgerow-syrup",
  },
  {
    slug: "kettleroot-draught",
    name: "Kettleroot Draught",
    description:
      "Steeped hot and drunk hotter. Tastes of the inside of a chimney and works before the cup is cool.",
    type: "REMEDY",
    category: "remedies",
    tags: ["brewed", "preserved"],
    price: 38n,
    rarity: "COMMON",
    artKey: "kettleroot-draught",
  },
  {
    slug: "cool-clay-salve",
    name: "Cool Clay Salve",
    description:
      "Grey, gritty, and immediately the best thing that has ever happened to whatever it is put on.",
    type: "REMEDY",
    category: "remedies",
    tags: ["salvaged", "preserved"],
    price: 30n,
    rarity: "COMMON",
    artKey: "cool-clay-salve",
  },
  {
    slug: "softfoot-poultice",
    name: "Softfoot Poultice",
    description:
      "Warm mash in a cloth, tied on with more ceremony than the situation strictly requires.",
    type: "REMEDY",
    category: "remedies",
    tags: ["preserved", "foraged"],
    price: 36n,
    rarity: "COMMON",
    artKey: "softfoot-poultice",
  },
  {
    slug: "rinsing-water",
    name: "Bottle of Rinsing Water",
    description:
      "Ordinary fresh water, bottled by somebody who understood that when you need it you really need it.",
    type: "REMEDY",
    category: "remedies",
    tags: ["water", "preserved"],
    price: 22n,
    rarity: "COMMON",
    artKey: "rinsing-water",
  },
  {
    slug: "an-apology",
    name: "A Formal Apology",
    description:
      "A small card, blank, for writing on. The apothecary is entirely serious about this and will not discuss it further.",
    type: "REMEDY",
    category: "remedies",
    tags: ["bound", "keepsake"],
    price: 18n,
    rarity: "COMMON",
    artKey: "an-apology",
  },
  {
    // The broad one. Dearer because it saves a walk, not because it works
    // better — every remedy in this file settles its ailment completely.
    slug: "greenglass-tonic",
    name: "Greenglass Tonic",
    description:
      "In a heavy green bottle with a ground stopper. Settles whatever is the matter, which the apothecary insists is a matter of preparation rather than magic.",
    type: "REMEDY",
    category: "remedies",
    tags: ["brewed", "glass"],
    price: 110n,
    rarity: "UNCOMMON",
    artKey: "greenglass-tonic",
  },

  // ---- Grooming tools -------------------------------------------------
  {
    slug: "bristle-brush",
    name: "Bristle Brush",
    description:
      "Stiff, plain, and effective. The handle has been worn to the shape of somebody else's hand and will not be changing back.",
    type: "GROOMING_TOOL",
    category: "grooming",
    tags: ["wood", "keepsake"],
    price: 90n,
    rarity: "COMMON",
    artKey: "bristle-brush",
    coatCare: 22,
  },
  {
    slug: "wide-tooth-comb",
    name: "Wide-Tooth Comb",
    description:
      "Horn, polished by use. Goes through the worst of it without any of the arguing a fine comb causes.",
    type: "GROOMING_TOOL",
    category: "grooming",
    tags: ["keepsake", "salvaged"],
    price: 130n,
    rarity: "COMMON",
    artKey: "wide-tooth-comb",
    coatCare: 28,
  },
  {
    slug: "chamois-cloth",
    name: "Chamois Cloth",
    description:
      "Soft, slightly damp, and reserved for the finishing. Doing this first and the brush second is a mistake everyone makes once.",
    type: "GROOMING_TOOL",
    category: "grooming",
    tags: ["keepsake", "preserved"],
    price: 75n,
    rarity: "COMMON",
    artKey: "chamois-cloth",
    coatCare: 18,
  },
  {
    slug: "seedburr-rake",
    name: "Seedburr Rake",
    description:
      "Four blunt tines for the things that come home in a coat after a good day out. Not sharp, and not gentle either.",
    type: "GROOMING_TOOL",
    category: "grooming",
    tags: ["metal", "keepsake"],
    price: 165n,
    rarity: "UNCOMMON",
    artKey: "seedburr-rake",
    coatCare: 34,
  },
  {
    slug: "warm-flannel",
    name: "Warm Flannel",
    description:
      "Kept in a covered dish beside the stove. Nobody has ever explained the dish and nobody has ever asked.",
    type: "GROOMING_TOOL",
    category: "grooming",
    tags: ["keepsake", "preserved"],
    price: 210n,
    rarity: "UNCOMMON",
    artKey: "warm-flannel",
    coatCare: 40,
  },
] as const satisfies readonly ItemContent[];

/**
 * What each remedy settles, and how much comfort it gives back.
 *
 * A null `ailmentKey` is the broad tonic. Everything else names one kind —
 * and a remedy offered for the wrong ailment is REFUSED rather than
 * consumed, so nobody ever loses a bottle to a misread label.
 */
export const remedies = [
  { itemSlug: "hedgerow-syrup", ailmentKey: "stonecough", comfort: 6 },
  { itemSlug: "kettleroot-draught", ailmentKey: "damp-chill", comfort: 8 },
  { itemSlug: "cool-clay-salve", ailmentKey: "bramble-itch", comfort: 7 },
  { itemSlug: "softfoot-poultice", ailmentKey: "thistlefoot", comfort: 7 },
  { itemSlug: "rinsing-water", ailmentKey: "saltburr", comfort: 5 },
  { itemSlug: "an-apology", ailmentKey: "the-sulks", comfort: 12 },
  { itemSlug: "greenglass-tonic", ailmentKey: null, comfort: 10 },
] as const satisfies readonly RemedyContent[];
