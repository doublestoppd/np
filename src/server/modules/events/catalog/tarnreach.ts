import type { RandomEventDefinition } from "../types";

/**
 * The high country being itself at you.
 *
 * Tarnreach's register is cold, quiet, and slightly too big. Dapplewood
 * gives you marvels and Saltmere gives you people with opinions; up here
 * you mostly get weather, distance, and the occasional strong suspicion
 * that the water is deeper than anyone has admitted.
 *
 * Most of these are route-gated to a single place, which is the point: a
 * cairn field that only does something odd while you are standing in the
 * cairn field is worth writing.
 */
export const tarnreachEvents: RandomEventDefinition[] = [
  {
    key: "the-cloud-arrives",
    title: "The cloud arrives",
    message:
      "Visibility goes from a mile to an arm's length in about four seconds. It will lift. It always lifts. It is not lifting yet.",
    weight: 600,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/tarnreach"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "further-than-it-looks",
    title: "Further than it looks",
    message:
      "The far side of the water has been the same distance away for twenty minutes of solid walking. You check the map. The map agrees with the walking and not with your eyes.",
    weight: 520,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/tarnreach"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "somebody-added-a-stone",
    title: "Somebody has added a stone",
    message:
      "The cairn you passed on the way up is one stone taller on the way down. Nobody has come past you. You add one anyway, because that is the arrangement.",
    weight: 450,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/tarnreach/the-cairn-field"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "the-kettle-was-already-on",
    title: "The kettle was already on",
    message:
      "Nobody is in the hut. The stove is lit, the kettle is hot, and there are two cups out. There is no note. There is never a note.",
    weight: 420,
    enabled: true,
    category: "place",
    rarity: "common",
    eligibility: { routePrefixes: ["/explore/tarnreach/the-warming-hut"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "something-turns-over",
    title: "Something turns over",
    message:
      "Out in the middle, well beyond any cast, the surface breaks and closes over something long. The water is flat again before you can decide what you saw.",
    weight: 380,
    enabled: true,
    category: "place",
    rarity: "uncommon",
    eligibility: { routePrefixes: ["/explore/tarnreach/the-upper-tarn"] },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "a-stone-that-matches-nothing",
    title: "A stone that matches nothing",
    message:
      "The stonesetter holds up a cut stone with no partner, considers it for a while, and puts it back in the box. The box, you notice, is quite full.",
    weight: 340,
    enabled: true,
    category: "place",
    rarity: "uncommon",
    eligibility: {
      routePrefixes: ["/explore/tarnreach/the-stonesetters-hut"],
    },
    effects: [{ kind: "flavor" }],
  },
  {
    key: "cold-hands-warm-companion",
    title: "Warm through the coat",
    message:
      "{pet} has worked out that the inside of your coat is the warmest place in the region and has taken up residence there. Progress is slower. Nobody minds.",
    weight: 400,
    enabled: true,
    category: "companion",
    rarity: "common",
    eligibility: {
      requiresPet: true,
      routePrefixes: ["/explore/tarnreach"],
    },
    effects: [
      { kind: "petStat", stat: "happiness", delta: 7 },
      { kind: "petStat", stat: "energy", delta: 4 },
    ],
  },
  {
    key: "the-water-gives-something-back",
    title: "The water gives something back",
    message:
      "Something pale is wedged between two rocks at the edge, put there by weather rather than by anyone, put there by weather rather than by anyone. It has clearly been there a while and is It has been there a while and it did not grow there.",
    weight: 90,
    enabled: true,
    category: "discovery",
    rarity: "uncommon",
    eligibility: { routePrefixes: ["/explore/tarnreach"] },
    effects: [
      { kind: "item", slug: "river-glass-pebble", quantity: 1 },
    ],
  },
];
