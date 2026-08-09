"use client";

import { useEffect, useRef, useState } from "react";
import type { ShrineTune } from "@prisma/client";
import {
  beatSeconds,
  frequency,
  TUNES,
  tuneSeconds,
  type Note,
  type TuneSpec,
} from "@/lib/shrine/tunes";

/**
 * The shrine's theme tune (ADR-70).
 *
 * Two oscillators and a gain envelope per note, scheduled against the
 * audio clock rather than a timer — `setTimeout` drifts, and a melody that
 * drifts against its own bass is worse than no melody. Everything is
 * scheduled for one pass at press time and rescheduled when the pass ends,
 * so a long tune costs nothing while it is not playing.
 *
 * The context is created on the click, never on mount: a suspended
 * AudioContext per page load is a resource the visitor did not ask for,
 * and creating one before a gesture is what browsers refuse anyway.
 */

/** Kept low. It is a novelty, not a broadcast. */
const VOLUME = 0.12;
const BASS_VOLUME = 0.09;

function scheduleVoice(
  context: AudioContext,
  destination: GainNode,
  notes: readonly Note[],
  startAt: number,
  sixteenth: number,
  voice: OscillatorType,
  volume: number,
): number {
  let at = startAt;
  for (const [semitones, length] of notes) {
    const seconds = length * sixteenth;
    if (semitones !== null) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = voice;
      oscillator.frequency.value = frequency(semitones);

      // A short attack and a decay to near-silence. Without an envelope
      // every note starts and ends with a click, which is the sound of a
      // square wave being switched on rather than a note being played.
      const peak = volume;
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      envelope.gain.exponentialRampToValueAtTime(
        0.0001,
        at + Math.max(0.06, seconds * 0.9),
      );

      oscillator.connect(envelope);
      envelope.connect(destination);
      oscillator.start(at);
      oscillator.stop(at + seconds);
    }
    at += seconds;
  }
  return at;
}

export function TunePlayer({ tune }: { tune: ShrineTune }) {
  const spec: TuneSpec | null = TUNES[tune];
  const [playing, setPlaying] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const loop = useRef<number | null>(null);

  const stop = () => {
    if (loop.current !== null) {
      window.clearTimeout(loop.current);
      loop.current = null;
    }
    // Closing the context stops every scheduled oscillator at once, which
    // is what "stop" has to mean when a whole pass is already queued.
    void context.current?.close();
    context.current = null;
    master.current = null;
    setPlaying(false);
  };

  // Nobody wants a tune following them to the next page.
  useEffect(() => stop, []);

  if (!spec) return null;

  const play = () => {
    if (playing) {
      stop();
      return;
    }
    const audio = new AudioContext();
    const gain = audio.createGain();
    gain.gain.value = 1;
    gain.connect(audio.destination);
    context.current = audio;
    master.current = gain;
    setPlaying(true);

    const sixteenth = beatSeconds(spec.bpm);
    const pass = tuneSeconds(spec);

    const schedule = () => {
      const audioNow = context.current;
      const out = master.current;
      if (!audioNow || !out) return;
      const at = audioNow.currentTime + 0.06;
      scheduleVoice(
        audioNow,
        out,
        spec.melody,
        at,
        sixteenth,
        spec.voice,
        VOLUME,
      );
      scheduleVoice(audioNow, out, spec.bass, at, sixteenth, "triangle", BASS_VOLUME);
      // Reschedule slightly early so the loop has no seam.
      loop.current = window.setTimeout(schedule, pass * 1000 - 40);
    };
    schedule();
  };

  return (
    <div className="shrine-tune">
      <button type="button" onClick={play} className="shrine-button">
        {playing ? "⏹ Stop the music" : "▶ Play my theme"}
      </button>{" "}
      <span className="shrine-tune-name">{spec.name}</span>
    </div>
  );
}
