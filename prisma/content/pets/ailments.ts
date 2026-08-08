import type { AilmentKindContent } from "../schemas";

/**
 * Things a companion can pick up (ADR-60).
 *
 * **These are weather, not judgement.** Nothing here is framed as a
 * consequence of neglect, and the copy never scolds — a companion catches
 * a chill because it is that sort of morning, and being brushed and fed
 * makes it a little less likely rather than being the reason it happened.
 * That distinction is the whole reason this feature is compatible with
 * "no punitive inactivity": the worst thing an ailment ever does is make a
 * companion a bit glum for a day or two, and it ends on its own.
 *
 * Three rules held while writing these:
 *
 * 1. **Every one has a `comfort` line**, and it is the second thing the
 *    player reads. The first question anybody has when told their
 *    companion is ill is "have I broken something", and the answer is
 *    always no. Saying so is not padding; it is the feature working.
 * 2. **Nothing is disgusting or distressing.** These are the small
 *    complaints of a healthy animal — a cough, an itch, a sulk about the
 *    weather. Nothing here needs a vet, and nothing here is frightening
 *    to read about a creature somebody is fond of.
 * 3. **`restHours` is the free path and it is never long.** The dearest
 *    remedy in the game buys at most three days of impatience. A player
 *    with no coins at all is never stuck, only slower.
 */
export const ailmentKinds = [
  {
    key: "stonecough",
    name: "Stonecough",
    symptom:
      "A dry, unimpressive little cough, picked up off cold rock. It comes in threes and is followed, every time, by a look of great personal offence.",
    comfort:
      "Nothing to worry about. It passes on its own in a day or so, and eating and playing carry on as normal.",
    restHours: 24,
    happinessDrag: 1,
    healthCap: 75,
  },
  {
    key: "damp-chill",
    name: "Damp Chill",
    symptom:
      "Got wet, stayed wet, and has decided to be dramatic about it. Sits closer to things than usual and sighs at the middle distance.",
    comfort:
      "Warmth and time are the whole treatment. It will be over by tomorrow evening at the latest.",
    restHours: 30,
    happinessDrag: 2,
    healthCap: 70,
  },
  {
    key: "bramble-itch",
    name: "Bramble Itch",
    symptom:
      "Went somewhere thorny with great enthusiasm and is now regretting one specific patch of it, loudly, at intervals.",
    comfort:
      "Harmless and short. A brush helps more than anything, and it settles by itself either way.",
    restHours: 20,
    happinessDrag: 2,
    healthCap: 80,
  },
  {
    key: "thistlefoot",
    name: "Thistlefoot",
    symptom:
      "Standing oddly, favouring one side, and looking at you as though you personally arranged the thistle.",
    comfort:
      "Sore rather than hurt. It walks it off within a day and there is nothing lasting about it.",
    restHours: 28,
    happinessDrag: 2,
    healthCap: 70,
  },
  {
    key: "saltburr",
    name: "Saltburr",
    symptom:
      "Came back from the flats with salt worked right down into the coat, and is now crunchy in a way nobody enjoys.",
    comfort:
      "Entirely cosmetic and entirely temporary. Combs out, or falls out, whichever happens first.",
    restHours: 36,
    happinessDrag: 1,
    healthCap: 85,
  },
  {
    key: "the-sulks",
    name: "The Sulks",
    symptom:
      "Facing the wall. Will not say why. Has taken a position and intends to hold it for some time.",
    comfort:
      "Not an illness so much as an opinion. It lifts on its own, and there is no wrong thing you can do about it.",
    restHours: 18,
    happinessDrag: 3,
    healthCap: 90,
  },
] as const satisfies readonly AilmentKindContent[];
