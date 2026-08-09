import { describe, expect, it } from "vitest";
import {
  beatSeconds,
  frequency,
  TUNES,
  tuneList,
  tuneSeconds,
  voiceLengths,
} from "./tunes";

/**
 * The shrine's theme tunes (ADR-70).
 *
 * The one property that actually matters is that the two voices are the
 * same length. A mismatch is inaudible on the first pass and unbearable
 * after that: the bass drifts a further beat out of step every time round,
 * and the tune loops forever. Two of the six were written wrong and this
 * is what found them.
 */

const PLAYABLE = Object.entries(TUNES).flatMap(([key, spec]) =>
  spec ? [[key, spec] as const] : [],
);

describe("the tunes", () => {
  it("offers silence and several tunes", () => {
    expect(TUNES.NONE).toBeNull();
    expect(PLAYABLE.length).toBeGreaterThanOrEqual(6);
    // The picker is keyed off the record, so it cannot fall behind it.
    expect(tuneList()).toHaveLength(PLAYABLE.length + 1);
  });

  it("keeps both voices exactly the same length", () => {
    for (const [key, spec] of PLAYABLE) {
      const { melody, bass } = voiceLengths(spec);
      expect(bass, `${key}: bass drifts against the melody`).toBe(melody);
    }
  });

  it("writes notes a real instrument could reach", () => {
    // Roughly two octaves either side of A4. A stray digit in a semitone
    // offset is otherwise silent in review and a shriek in the browser.
    for (const [key, spec] of PLAYABLE) {
      for (const [semitones] of [...spec.melody, ...spec.bass]) {
        if (semitones === null) continue;
        expect(semitones, `${key}`).toBeGreaterThanOrEqual(-30);
        expect(semitones, `${key}`).toBeLessThanOrEqual(30);
      }
    }
  });

  it("gives every note a positive length", () => {
    for (const [key, spec] of PLAYABLE) {
      for (const [, length] of [...spec.melody, ...spec.bass]) {
        expect(length, `${key}`).toBeGreaterThan(0);
      }
    }
  });

  it("loops in a few seconds, not a few minutes", () => {
    for (const [key, spec] of PLAYABLE) {
      const seconds = tuneSeconds(spec);
      expect(seconds, `${key}`).toBeGreaterThan(3);
      expect(seconds, `${key}`).toBeLessThan(30);
    }
  });

  it("converts semitones to the frequencies they name", () => {
    expect(frequency(0)).toBeCloseTo(440, 6);
    expect(frequency(12)).toBeCloseTo(880, 6);
    expect(frequency(-12)).toBeCloseTo(220, 6);
  });

  it("turns a tempo into a sixteenth", () => {
    // 120bpm: a beat is half a second, a sixteenth is an eighth of one.
    expect(beatSeconds(120)).toBeCloseTo(0.125, 6);
  });
});
