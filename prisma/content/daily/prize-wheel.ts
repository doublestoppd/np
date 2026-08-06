import type { WheelContent } from "../schemas";

const nothingFlavorLines = [
  "The wheel has awarded you a valuable lesson in probability.",
  "Nothing. It was very neatly wrapped.",
  "The pointer stopped between optimism and accounting.",
  "You receive the rare privilege of trying again tomorrow.",
  "The wheel insists this outcome builds character.",
].join("\n");

/**
 * The Brassbell Pavilion prize wheel.
 *
 * Prize weights are basis points and must sum to exactly 10000. The
 * configuration is IMMUTABLE_VERSIONED: once any spin references a
 * version, seeding refuses to change it — to adjust prizes or weights,
 * copy the configuration block, bump `version`, and edit the copy. Icons
 * are presentation-only and may be freshened on an existing version.
 * Slices render at equal size; the weights are the real odds.
 */
export const prizeWheel = {
  slug: "brassbell-wheel",
  name: "The Brassbell Wheel",
  pools: [
    {
      slug: "brassbell-common-curiosities",
      poolType: "COMMON",
      entries: [
        { itemSlug: "dewdrop-vial", weight: 100 },
        { itemSlug: "patchwork-ribbon", weight: 100 },
        { itemSlug: "mossy-brass-button", weight: 100 },
        { itemSlug: "painted-river-pebble", weight: 100 },
        { itemSlug: "tiny-copper-bell", weight: 80 },
        { itemSlug: "woven-fern-bookmark", weight: 80 },
      ],
    },
    {
      slug: "brassbell-rare-curiosities",
      poolType: "RARE",
      entries: [
        { itemSlug: "starroot-brooch", weight: 100 },
        { itemSlug: "moonglass-teacup", weight: 100 },
        { itemSlug: "whispering-compass", weight: 80 },
        { itemSlug: "glasswing-music-box", weight: 60 },
        { itemSlug: "crown-of-quiet-lanterns", weight: 40 },
        { itemSlug: "silvercloud-keepsake", weight: 80 },
      ],
    },
  ],
  configuration: {
    version: 1,
    prizes: [
      { label: "Nothing", icon: "🍃", resultType: "NOTHING", weight: 2000, displayOrder: 0, flavorText: nothingFlavorLines },
      { label: "A Few Coins", icon: "🪙", resultType: "COINS", weight: 2800, coinAmount: 25n, displayOrder: 1 },
      { label: "Pocket Change", icon: "👛", resultType: "COINS", weight: 2200, coinAmount: 50n, displayOrder: 2 },
      { label: "A Respectable Sum", icon: "💰", resultType: "COINS", weight: 1200, coinAmount: 100n, displayOrder: 3 },
      { label: "A Shiny Pile", icon: "✨", resultType: "COINS", weight: 500, coinAmount: 250n, displayOrder: 4 },
      { label: "Jackpot", icon: "👑", resultType: "COINS", weight: 100, coinAmount: 500n, displayOrder: 5 },
      { label: "Common Curiosity", icon: "🎁", resultType: "ITEM_POOL", weight: 1000, poolSlug: "brassbell-common-curiosities", displayOrder: 6 },
      { label: "Rare Curiosity", icon: "💎", resultType: "ITEM_POOL", weight: 200, poolSlug: "brassbell-rare-curiosities", displayOrder: 7 },
    ],
  },
} satisfies WheelContent;
