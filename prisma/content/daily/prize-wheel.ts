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
    // Version 2: the tail was cut. A single tap could return 500 coins —
    // more than all three word puzzles put together, for no decision at
    // all — which taught a new player that the wheel is where money comes
    // from and that playing well is beside the point. A veteran spotted
    // the shape immediately: a wheel with a "Nothing" wedge and a
    // 250-coin wedge is a slot machine wearing a hat.
    //
    // The top prize is now 200 and the whole curve is flatter: expected
    // value drops from ~47.5 to ~35, the maximum single spin drops by
    // 60%, and the wheel goes back to being a pleasant ten seconds rather
    // than the day's biggest earner.
    version: 2,
    prizes: [
      { label: "Nothing", icon: "🍃", resultType: "NOTHING", weight: 1800, displayOrder: 0, flavorText: nothingFlavorLines },
      { label: "A Few Coins", icon: "🪙", resultType: "COINS", weight: 2700, coinAmount: 25n, displayOrder: 1 },
      { label: "Pocket Change", icon: "👛", resultType: "COINS", weight: 2400, coinAmount: 45n, displayOrder: 2 },
      { label: "A Respectable Sum", icon: "💰", resultType: "COINS", weight: 1400, coinAmount: 75n, displayOrder: 3 },
      { label: "A Shiny Pile", icon: "✨", resultType: "COINS", weight: 400, coinAmount: 120n, displayOrder: 4 },
      { label: "A Very Good Morning", icon: "👑", resultType: "COINS", weight: 100, coinAmount: 200n, displayOrder: 5 },
      { label: "Common Curiosity", icon: "🎁", resultType: "ITEM_POOL", weight: 1000, poolSlug: "brassbell-common-curiosities", displayOrder: 6 },
      { label: "Rare Curiosity", icon: "💎", resultType: "ITEM_POOL", weight: 200, poolSlug: "brassbell-rare-curiosities", displayOrder: 7 },
    ],
  },
} satisfies WheelContent;
