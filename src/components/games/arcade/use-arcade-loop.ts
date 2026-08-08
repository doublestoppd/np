"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  encodeTrace,
  MAX_EVENTS,
  MAX_TICKS,
  MIN_EVENT_GAP_TICKS,
  TICK_MS,
  type ArcadeSim,
  type InputEvent,
} from "@/lib/games/arcade/core";

/**
 * The fixed-timestep loop both arcade games run on (ADR-62).
 *
 * Two jobs, and the second one is why this exists rather than each game
 * having its own `requestAnimationFrame`:
 *
 * 1. **Simulate in whole ticks, never in frames.** The display's refresh
 *    rate is not the game's clock. A 120Hz phone and a 60Hz laptop must
 *    produce the same game from the same inputs or the server's replay
 *    disagrees with what the player saw — so elapsed real time is
 *    accumulated and spent in TICK_MS chunks, and the renderer draws
 *    whatever state falls out.
 * 2. **Record the trace as it happens.** An input is stamped with the tick
 *    it is applied on, which is the tick the server will apply it on. The
 *    trace is not reconstructed afterwards from what the client thinks
 *    happened; it IS what happened.
 *
 * The loop deliberately does not extrapolate between ticks. At 50 ticks a
 * second the difference is invisible, and interpolation would mean the
 * drawn position and the simulated position disagreeing — which is exactly
 * the class of bug that makes a player swear they cleared a gap.
 */

export type ArcadePhase = "READY" | "PLAYING" | "OVER";

export interface ArcadeLoop<TState> {
  state: TState;
  phase: ArcadePhase;
  score: number;
  /** The encoded trace, ready to submit. Empty until the run ends. */
  trace: string;
  /** Feed one input. `code` is the game's own vocabulary. */
  input: (code: number) => void;
  /** Begin a fresh run on this seed. */
  restart: () => void;
}

export function useArcadeLoop<TState>({
  sim,
  seed,
  onEnd,
}: {
  sim: ArcadeSim<TState>;
  seed: string;
  onEnd?: (trace: string, score: number) => void;
}): ArcadeLoop<TState> {
  const [state, setState] = useState<TState>(() => sim.start(seed));
  const [phase, setPhase] = useState<ArcadePhase>("READY");
  const [trace, setTrace] = useState("");

  // Everything the loop mutates lives in refs: React state is for what the
  // renderer reads, and a fifty-times-a-second setState of the tick count
  // would be fifty renders a second of nothing anybody can see.
  const live = useRef<TState>(state);
  const tick = useRef(0);
  const events = useRef<InputEvent[]>([]);
  const lastEventTick = useRef(-MIN_EVENT_GAP_TICKS - 1);
  const pending = useRef<number[]>([]);
  const running = useRef(false);
  const carry = useRef(0);
  const frame = useRef<number | null>(null);
  const previous = useRef(0);
  const ended = useRef<((trace: string, score: number) => void) | undefined>(onEnd);
  ended.current = onEnd;

  const finish = useCallback(() => {
    running.current = false;
    const encoded = encodeTrace(events.current);
    setTrace(encoded);
    setPhase("OVER");
    setState(live.current);
    ended.current?.(encoded, sim.score(live.current));
  }, [sim]);

  const restart = useCallback(() => {
    const fresh = sim.start(seed);
    live.current = fresh;
    tick.current = 0;
    events.current = [];
    lastEventTick.current = -MIN_EVENT_GAP_TICKS - 1;
    pending.current = [];
    carry.current = 0;
    previous.current = 0;
    running.current = true;
    setState(fresh);
    setTrace("");
    setPhase("PLAYING");
  }, [seed, sim]);

  const input = useCallback(
    (code: number) => {
      if (phase === "READY") {
        restart();
        pending.current.push(code);
        return;
      }
      if (!running.current) return;
      pending.current.push(code);
    },
    [phase, restart],
  );

  useEffect(() => {
    const step = (now: number) => {
      frame.current = requestAnimationFrame(step);
      if (!running.current) return;

      if (previous.current === 0) {
        previous.current = now;
        return;
      }
      // Clamped: a backgrounded tab hands back a gap of minutes, and
      // simulating four thousand ticks in one frame would both lock the
      // page and kill a run the player was not even watching. Losing the
      // time is the kind thing to do — the run simply pauses.
      const elapsed = Math.min(250, now - previous.current);
      previous.current = now;
      carry.current += elapsed;

      let changed = false;
      while (carry.current >= TICK_MS) {
        carry.current -= TICK_MS;

        // At most one input per tick, which is what the trace codec
        // allows. Extra taps in the same tick are dropped rather than
        // queued forward: queueing would mean the trace saying something
        // the player did not do.
        let code = 0;
        if (pending.current.length > 0) {
          code = pending.current.shift() as number;
          pending.current.length = 0;
          if (
            tick.current - lastEventTick.current >= MIN_EVENT_GAP_TICKS &&
            events.current.length < MAX_EVENTS
          ) {
            events.current.push({ tick: tick.current, code });
            lastEventTick.current = tick.current;
          } else {
            // Too soon to be recordable, so it must not be simulated
            // either — the client's game and the server's replay have to
            // see the same inputs.
            code = 0;
          }
        }

        live.current = sim.step(live.current, code);
        tick.current += 1;
        changed = true;

        if (sim.ended(live.current) || tick.current >= MAX_TICKS) {
          finish();
          return;
        }
      }
      if (changed) setState(live.current);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [finish, sim]);

  // A tab going away mid-run should not cost the run. The loop keeps its
  // state and simply stops advancing; `previous` is reset so the first
  // frame back does not spend the whole absence at once.
  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) previous.current = 0;
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, []);

  return {
    state,
    phase,
    score: sim.score(state),
    trace,
    input,
    restart,
  };
}
