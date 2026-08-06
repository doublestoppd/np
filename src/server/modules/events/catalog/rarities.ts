import type { RandomEventDefinition } from "../types";

/**
 * The tail of the distribution.
 *
 * Weights here are deliberately tiny against a common pool in the
 * thousands, and the two genuinely rare finds carry their own long
 * cooldowns on top — a legendary that can repeat next week is not a
 * legendary. `minAccountAgeHours` keeps them off brand-new accounts, where
 * an extraordinary find in the first ten minutes reads as scripted rather
 * than lucky and quietly teaches the player that the game hands things out.
 *
 * Nothing here is instanced or provenance-bearing. A one-of-a-kind object
 * with a recorded history deserves a story about where it came from; "you
 * refreshed a page" is not that story.
 */
export const rareEvents: RandomEventDefinition[] = [
  {
    key: "a-good-day-for-looking-down",
    title: "A good day for looking down",
    message:
      "A purse someone lost a long time ago, judging by the state of the leather. The coins inside are still perfectly good coins.",
    weight: 250,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    effects: [{ kind: "coins", min: 25, max: 60 }],
  },
  {
    key: "river-glass",
    title: "River glass",
    message:
      "Years of water have worn a piece of something sharp into something you can hold. It catches the light like it is proud of the improvement.",
    weight: 200,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    effects: [{ kind: "item", slug: "river-glass-pebble", quantity: 1 }],
  },
  {
    key: "sunshower",
    title: "Sunshower",
    message:
      "Rain and full sun at once, for about ninety seconds. You catch some of it in a vial before it stops, which is the only way anyone ever gets any.",
    weight: 120,
    enabled: true,
    category: "grove",
    rarity: "uncommon",
    cooldownMinutes: 720,
    effects: [{ kind: "item", slug: "sunshower-vial", quantity: 1 }],
  },
  {
    key: "the-echo-shell",
    title: "The echo shell",
    message:
      "A shell, far from any sea, half-buried at the foot of a tree. Held to your ear it does not give you the sound of water. It gives you the sound of this clearing, from slightly too long ago.",
    weight: 25,
    enabled: true,
    category: "discovery",
    rarity: "rare",
    cooldownMinutes: 1_440,
    eligibility: { minAccountAgeHours: 24 },
    effects: [{ kind: "item", slug: "echo-shell", quantity: 1 }],
  },
  {
    key: "gilded-acorn-in-the-leaf-litter",
    title: "The gilded acorn",
    message:
      "You have picked up a hundred acorns in this grove and thought nothing of any of them. This one is heavier than it has any right to be, and it is not brass.",
    weight: 3,
    enabled: true,
    category: "discovery",
    rarity: "legendary",
    cooldownMinutes: 10_080,
    eligibility: { minAccountAgeHours: 72 },
    effects: [{ kind: "item", slug: "gilded-acorn", quantity: 1 }],
  },
];
