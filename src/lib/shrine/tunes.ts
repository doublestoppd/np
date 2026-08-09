import type { ShrineTune } from "@prisma/client";

/**
 * A shrine's theme tune (ADR-70). PURE — notes and numbers, no audio.
 *
 * **Every page had one and every one of them was a MIDI file.** This is
 * the same joke without the 40KB download: the notes are here, and the
 * browser's own oscillators play them. No assets, no licensing, nothing to
 * host, and a "tune" costs one enum value in a row.
 *
 * **It does not autoplay.** Partly because browsers refuse to start audio
 * without a gesture, so a page that tried would simply be silent — but
 * mostly because starting music in somebody's ear because they followed a
 * link is the one thing about the era nobody actually misses. The page
 * offers a button. Pressing it is the whole nostalgia.
 *
 * Notes are semitone offsets from A4 (440Hz), `null` for a rest, paired
 * with a length in sixteenths. Two voices: a melody and a plain bass that
 * lands on the beat, which is roughly all a four-operator chip did anyway.
 */

export type Note = readonly [semitones: number | null, sixteenths: number];

export interface TuneSpec {
  name: string;
  /** Sixteenths per minute is unreadable; this is beats per minute. */
  bpm: number;
  /** Square wave for the melody voice, triangle for something softer. */
  voice: OscillatorType;
  melody: readonly Note[];
  bass: readonly Note[];
}

/** A4 is 440Hz; every note is a semitone offset from it. */
export function frequency(semitones: number): number {
  return 440 * Math.pow(2, semitones / 12);
}

const R: Note = [null, 2];

/**
 * Exhaustive over the Prisma enum. NONE has no notes and is the default —
 * a shrine is silent unless somebody chose otherwise.
 */
export const TUNES: Record<ShrineTune, TuneSpec | null> = {
  NONE: null,

  MOSSY_WALTZ: {
    name: "Mossy Waltz",
    bpm: 132,
    voice: "triangle",
    // Three-four, and it leans on the one like every waltz ever written.
    melody: [
      [0, 4], [4, 2], [7, 2], [4, 4], [0, 2], [4, 2],
      [7, 4], [11, 2], [12, 2], [11, 4], [7, 2], [4, 2],
      [5, 4], [9, 2], [12, 2], [9, 4], [5, 2], [2, 2],
      [0, 8], R, R,
    ],
    bass: [
      [-12, 4], [-5, 4], [-5, 4],
      [-12, 4], [-5, 4], [-5, 4],
      [-7, 4], [0, 4], [0, 4],
      [-5, 4], [-5, 4], [-5, 4],
      [-12, 8], [-12, 4],
    ],
  },

  BRASS_MARCH: {
    name: "Brass March",
    bpm: 116,
    voice: "square",
    melody: [
      [0, 2], [0, 2], [4, 2], [7, 2], [12, 4], [7, 4],
      [9, 2], [9, 2], [7, 2], [4, 2], [5, 4], [0, 4],
      [0, 2], [0, 2], [4, 2], [7, 2], [12, 4], [16, 4],
      [14, 2], [12, 2], [7, 4], [12, 8],
    ],
    bass: [
      [-12, 4], [-12, 4], [-5, 4], [-5, 4],
      [-10, 4], [-10, 4], [-12, 4], [-12, 4],
      [-12, 4], [-12, 4], [-5, 4], [-5, 4],
      [-5, 4], [-5, 4], [-12, 8],
    ],
  },

  LANTERN_LULLABY: {
    name: "Lantern Lullaby",
    bpm: 84,
    voice: "sine",
    melody: [
      [7, 4], [4, 4], [0, 4], [4, 4],
      [7, 4], [9, 4], [7, 8],
      [5, 4], [4, 4], [2, 4], [0, 4],
      [-3, 4], [0, 4], [0, 8],
    ],
    bass: [
      [-12, 8], [-12, 8],
      [-5, 8], [-5, 8],
      [-7, 8], [-7, 8],
      [-12, 8], [-12, 8],
    ],
  },

  DEEP_DIRGE: {
    name: "Deep Dirge",
    bpm: 72,
    voice: "sawtooth",
    // Minor, and it never resolves. It is a hole in the ground.
    melody: [
      [0, 6], [3, 2], [7, 6], [3, 2],
      [10, 6], [7, 2], [3, 8],
      [0, 6], [-2, 2], [-5, 8],
      [0, 4], [null, 4], [0, 8],
    ],
    bass: [
      [-12, 8], [-12, 8],
      [-14, 8], [-14, 8],
      [-17, 8], [-17, 8],
      [-12, 16],
    ],
  },

  MARKET_JIG: {
    name: "Market Jig",
    bpm: 152,
    voice: "square",
    melody: [
      [0, 2], [2, 1], [4, 1], [5, 2], [4, 2],
      [2, 2], [0, 2], [4, 4],
      [7, 2], [5, 1], [4, 1], [2, 2], [4, 2],
      [0, 4], R, [0, 2],
      [9, 2], [7, 1], [5, 1], [4, 2], [5, 2],
      [7, 4], [4, 4],
      [2, 2], [0, 2], [-3, 2], [0, 2], [0, 8],
    ],
    bass: [
      [-12, 4], [-12, 4], [-5, 4], [-5, 4],
      [-12, 4], [-12, 4], [-5, 4], [-5, 4],
      [-10, 4], [-10, 4], [-5, 4], [-5, 4],
      [-12, 8], [-12, 8],
    ],
  },

  STARLIGHT: {
    name: "Starlight",
    bpm: 96,
    voice: "triangle",
    melody: [
      [12, 4], [11, 2], [9, 2], [7, 4], [9, 4],
      [11, 4], [7, 4], [4, 8],
      [9, 4], [7, 2], [4, 2], [2, 4], [4, 4],
      [7, 4], [4, 4], [0, 8],
    ],
    bass: [
      [-12, 8], [-8, 8],
      [-5, 8], [-12, 8],
      [-10, 8], [-7, 8],
      [-5, 8], [-12, 8],
    ],
  },
};

/** The picker's list, keyed off the record so it cannot fall behind. */
export function tuneList(): { key: ShrineTune; name: string }[] {
  return (Object.keys(TUNES) as ShrineTune[]).map((key) => ({
    key,
    name: TUNES[key]?.name ?? "No music",
  }));
}

/** Sixteenths → seconds, given a tempo. */
export function beatSeconds(bpm: number): number {
  // A sixteenth is a quarter of a beat.
  return 60 / bpm / 4;
}

/** How long the whole loop runs, so the player can show a length. */
export function tuneSeconds(spec: TuneSpec): number {
  const sixteenths = spec.melody.reduce((sum, [, length]) => sum + length, 0);
  return sixteenths * beatSeconds(spec.bpm);
}

/**
 * Total sixteenths in each voice.
 *
 * Worth having because the two voices are written independently and a
 * mismatch is inaudible on the first pass and unbearable on the loop — the
 * bass drifts a beat further out every time round. The test pins it.
 */
export function voiceLengths(spec: TuneSpec): { melody: number; bass: number } {
  const total = (notes: readonly Note[]) =>
    notes.reduce((sum, [, length]) => sum + length, 0);
  return { melody: total(spec.melody), bass: total(spec.bass) };
}
