import type { SpeciesContent } from "../schemas";

/** The three starter companions offered at adoption. */
export const starterSpecies = [
  {
    slug: "cindertail",
    name: "Cindertail",
    description:
      "A warm-hearted ember salamander whose tail tip glows softly when it is happy.",
    artKey: "cindertail",
  },
  {
    slug: "thornbud",
    name: "Thornbud",
    description:
      // Deliberately about time rather than diligence: "a new leaf for
      // every day it is well cared for" is a compliance meter with a
      // plant on it, and nothing in this game may punish a missed week.
      "A leafy sprout companion that puts out another leaf for every season it has been with you.",
    artKey: "thornbud",
  },
  {
    slug: "mistfin",
    name: "Mistfin",
    description:
      "A cheerful pond-dweller with feathery fins that ripple like morning fog on water.",
    artKey: "mistfin",
  },
] satisfies readonly SpeciesContent[];
