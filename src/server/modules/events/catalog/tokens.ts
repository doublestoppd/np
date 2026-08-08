import type { RandomEventDefinition } from "../types";

/**
 * Tokens found rather than bought (ADR-49).
 *
 * The counter at the Tumblehouse is one way to get a token and this is
 * the other, which matters more than it sounds: a machine you can only
 * feed by buying tokens is a machine that costs money to look at, and a
 * player who has never pulled the lever has no reason to care what the
 * black token does.
 *
 * The weights fall off a cliff on purpose, and the cliff is steeper than
 * the price ladder. A chalk token turns up reasonably often; an obsidian
 * one is a thing that happens to somebody, once. Each of the dear ones
 * carries a long private cooldown on top of the global one, so a lucky
 * hour cannot become two of them.
 *
 * `minAccountAgeHours` keeps the top two away from brand-new accounts,
 * for the reason given in rarities.ts: an extraordinary find in the first
 * ten minutes reads as scripted rather than lucky, and quietly teaches
 * the player that the game hands things out.
 *
 * These are finds, not payouts — none of them credit coins. What they
 * hand over is a turn of the drums, and what the drums do with it is
 * between the player and the drums.
 */
export const tokenEvents: RandomEventDefinition[] = [
  {
    key: "a-token-in-the-lining",
    title: "Something in the lining",
    message:
      "A white disc that has worked its way through a hole in your pocket and been riding in the hem ever since. It is good for one pull at the Tumblehouse.",
    weight: 220,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    effects: [{ kind: "item", slug: "chalk-token", quantity: 1 }],
  },
  {
    key: "change-from-the-ferry",
    title: "Change from the ferry",
    message:
      "The woman at the slipway is short of coins and settles up in Tumblehouse tokens, which she clearly regards as the better end of the deal. She may be right.",
    weight: 140,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    eligibility: { routePrefixes: ["/explore/saltmere"] },
    effects: [{ kind: "item", slug: "chalk-token", quantity: 2 }],
  },
  {
    key: "green-under-the-boards",
    title: "Green under the boards",
    message:
      "A gap between two planks, and something green in it that is not moss. Getting it out costs you a fingernail's worth of dignity.",
    weight: 60,
    enabled: true,
    category: "discovery",
    rarity: "rare",
    cooldownMinutes: 720,
    effects: [{ kind: "item", slug: "verdigris-token", quantity: 1 }],
  },
  {
    key: "the-raker-settles-a-debt",
    title: "The raker settles a debt",
    message:
      "You are handed a green token by someone who says you are owed it, from something you have no memory of. They are already walking away.",
    weight: 34,
    enabled: true,
    category: "place",
    rarity: "rare",
    cooldownMinutes: 1_440,
    eligibility: { routePrefixes: ["/explore/saltmere"] },
    effects: [{ kind: "item", slug: "verdigris-token", quantity: 1 }],
  },
  {
    key: "blue-in-the-silt",
    title: "Blue in the silt",
    message:
      "Enamel that colour does not occur in mud, which is how you spot it at all. The house will honour it; the house honours all of them.",
    weight: 9,
    enabled: true,
    category: "discovery",
    rarity: "rare",
    cooldownMinutes: 4_320,
    eligibility: { minAccountAgeHours: 24 },
    effects: [{ kind: "item", slug: "cobalt-token", quantity: 1 }],
  },
  {
    key: "the-amber-in-the-tin",
    title: "The amber in the tin",
    message:
      "An old tobacco tin with one thing in it, held up to the light out of habit before you understand what you are holding. Somebody kept this for a long time and then stopped.",
    weight: 2,
    enabled: true,
    category: "discovery",
    rarity: "legendary",
    cooldownMinutes: 20_160,
    eligibility: { minAccountAgeHours: 72 },
    effects: [{ kind: "item", slug: "amber-token", quantity: 1 }],
  },
  {
    key: "the-black-token",
    title: "The black token",
    message:
      "It is not shining, because it never does. You have heard about these and assumed, reasonably, that people were making them up.",
    weight: 1,
    enabled: true,
    category: "discovery",
    rarity: "legendary",
    cooldownMinutes: 43_200,
    eligibility: { minAccountAgeHours: 168 },
    effects: [{ kind: "item", slug: "obsidian-token", quantity: 1 }],
  },
];
