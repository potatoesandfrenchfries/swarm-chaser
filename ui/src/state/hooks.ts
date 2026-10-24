import { useEffect, useRef, useState } from 'react';
import { currentRun, useStore } from './store.tsx';

/** Time each event holds the stage during playback at 1×. */
export const DWELL_MS = 2000;
/** Time a pulse takes to travel from source to target at 1×. */
export const TRAVEL_MS = 950;

/**
 * The only timer that advances the replay. It is keyed on cursor, so a pause, a seek or a speed
 * change cancels the pending tick before it can fire; nothing else moves the cursor on a clock.
 */
export function usePlayback() {
  const { state, dispatch } = useStore();
  const run = currentRun(state);
  useEffect(() => {
    if (!state.playing || !run) return;
    if (state.cursor >= run.events.length - 1) {
      dispatch({ type: 'pause' });
      return;
    }
    const wait = state.cursor < 0 ? 450 : DWELL_MS / state.speed;
    const t = window.setTimeout(() => dispatch({ type: 'tick' }), wait);
    return () => window.clearTimeout(t);
  }, [state.playing, state.cursor, state.speed, run, dispatch]);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Progress 0→1 over `duration` ms, restarted whenever `key` changes. Returns 1 at once when not
 * animating, so a seek or reduced motion shows the settled state. Purely visual: nothing reads it
 * to decide what happened.
 */
export function useTween(key: string | number, duration: number, animate: boolean): number {
  const [p, setP] = useState(animate ? 0 : 1);
  const frame = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    if (!animate || duration <= 0) {
      setP(1);
      return;
    }
    const start = performance.now();
    setP(0);
    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setP(t);
      if (t < 1) frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame.current);
  }, [key, duration, animate]);
  return p;
}

/** A number that counts toward its target; jumps straight there under reduced motion. */
export function useCountUp(target: number, reduced: boolean, ms = 420): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced) {
      setV(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    let f = 0;
    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(Math.round(a + (target - a) * eased));
      if (t < 1) f = requestAnimationFrame(loop);
      else from.current = target;
    };
    f = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(f);
      from.current = target;
    };
  }, [target, reduced, ms]);
  return v;
}

export function easeTravel(t: number): number {
  // Matches --ease-travel: cubic-bezier(0.45, 0, 0.2, 1), approximated as smootherstep with a firmer landing.
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}
