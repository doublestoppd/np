import type { PetReaction } from "@/server/modules/pets/palate";

/**
 * How a companion's reaction is described.
 *
 * Presentation only — no rules, no numbers, and above all **no tag
 * names**. The palate is discovered by noticing, not by being told: the
 * moment a line says "loves salvaged things" the player stops offering
 * things and starts consulting an answer key, and the whole feature
 * becomes a lookup table with a pet on it.
 *
 * Kept in src/lib for the same reason pet-condition.ts is: it is imported
 * by client components and must never reach for server code.
 */

const DELIGHTED_FOOD = [
  "{pet} eats the {item} far too fast and looks around for more.",
  "{pet} makes a noise over the {item} that you have not heard before.",
  "The {item} does not survive long. {pet} is extremely pleased about it.",
];

const PARTICULAR_FOOD = [
  "{pet} stops. Considers the {item}. Then eats it with the reverence of someone at a ceremony.",
  "You have clearly got something right. {pet} has not looked away from the {item} once.",
];

const DELIGHTED_TOY = [
  "{pet} has taken the {item} to the far corner and is guarding it from nobody in particular.",
  "The {item} is thrown once. It is returned four times.",
  "{pet} is doing something complicated with the {item} that appears to have rules.",
];

const PARTICULAR_TOY = [
  "{pet} has the {item} and is not going to be reasonable about giving it back.",
  "This is, apparently, the one. {pet} has made that very clear about the {item}.",
];

const INDIFFERENT_FOOD = [
  "{pet} eats the {item} with the air of somebody doing you a favour.",
  "The {item} is eaten. No further comment is offered.",
];

const INDIFFERENT_TOY = [
  "{pet} looks at the {item}, then at you, then at the {item} again, and lies down.",
  "The {item} is nudged approximately one inch and then abandoned.",
];

/** Stable choice, so the same meal reads the same way twice. */
function choose(lines: readonly string[], key: string): string {
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  }
  return lines[hash % lines.length] ?? lines[0] ?? "";
}

/**
 * A sentence for what just happened, or null for an ordinary outcome —
 * where the existing "Fed X to Y" notice already says everything true.
 */
export function describeReaction(
  reaction: PetReaction,
  kind: "FOOD" | "TOY",
  { petName, itemName }: { petName: string; itemName: string },
): string | null {
  const lines =
    reaction === "particular"
      ? kind === "FOOD"
        ? PARTICULAR_FOOD
        : PARTICULAR_TOY
      : reaction === "delighted"
        ? kind === "FOOD"
          ? DELIGHTED_FOOD
          : DELIGHTED_TOY
        : reaction === "indifferent"
          ? kind === "FOOD"
            ? INDIFFERENT_FOOD
            : INDIFFERENT_TOY
          : null;
  if (!lines) {
    return null;
  }
  return choose(lines, `${petName}:${itemName}`)
    .replaceAll("{pet}", petName)
    .replaceAll("{item}", itemName);
}
