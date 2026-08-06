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
      "A leafy sprout companion that grows a new petal for every day it is well cared for.",
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
