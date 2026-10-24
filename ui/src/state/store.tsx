import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import type { BundleSummary } from '../../server/bundles.ts';
import { clampCursor } from '../model/replay.ts';
import type { Bundle, Run } from '../model/types.ts';
import { validateBundle } from '../model/validate.ts';

export type View = 'home' | 'replay' | 'compare' | 'graph';
export type Selection = { kind: 'event' | 'actor' | 'record' | 'claim'; id: string };
export const SPEEDS = [0.5, 1, 2, 4] as const;

export interface AppState {
  view: View;
  bundles: BundleSummary[] | null;
  /** Why the bundle list could not be fetched; the UI offers the synthetic demo explicitly, never silently. */
  listError: string | null;
  bundleId: string | null;
  bundle: Bundle | null;
  loading: boolean;
  bundleError: string | null;
  runId: string | null;
  cursor: number;
  playing: boolean;
  speed: number;
  /** Bumped on every cursor move; `animate` is false for seeks so scrubbing never animates. */
  transition: { nonce: number; animate: boolean; kind?: 'step' | 'play' };
  selection: Selection | null;
}

export type Action =
  | { type: 'view'; view: View }
  | { type: 'bundles'; list: BundleSummary[] }
  | { type: 'bundles-failed'; error: string }
  | { type: 'open-bundle'; id: string }
  | { type: 'bundle-loaded'; bundle: Bundle; runId?: string | null; cursor?: number }
  | { type: 'bundle-failed'; error: string }
  | { type: 'run'; runId: string; cursor?: number }
  | { type: 'seek'; cursor: number }
  | { type: 'step'; delta: number }
  | { type: 'tick' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'speed'; speed: number }
  | { type: 'select'; selection: Selection | null };

export function currentRun(s: Pick<AppState, 'bundle' | 'runId'>): Run | null {
  return s.bundle?.runs.find((r) => r.id === s.runId) ?? null;
}

function moved(s: AppState, cursor: number, animate: boolean, extra: Partial<AppState> = {}, kind: 'step' | 'play' = 'step'): AppState {
  const run = currentRun(s);
  const c = run ? clampCursor(run, cursor) : -1;
  return { ...s, ...extra, cursor: c, transition: { nonce: s.transition.nonce + 1, animate, kind } };
}

export function reducer(s: AppState, a: Action): AppState {
  const run = currentRun(s);
  const last = run ? run.events.length - 1 : -1;
  switch (a.type) {
    case 'view':
      return { ...s, view: a.view };
    case 'bundles':
      return { ...s, bundles: a.list, listError: null };
    case 'bundles-failed':
      return { ...s, listError: a.error };
    case 'open-bundle':
      return { ...s, bundleId: a.id, loading: true, bundleError: null, playing: false };
    case 'bundle-loaded': {
      const runId = a.runId && a.bundle.runs.some((r) => r.id === a.runId) ? a.runId : defaultRun(a.bundle);
      const next = { ...s, bundle: a.bundle, bundleId: a.bundle.id, loading: false, bundleError: null, runId, playing: false };
      return moved(next, a.cursor ?? -1, false, { selection: a.cursor === undefined ? null : s.selection });
    }
    case 'bundle-failed':
      return { ...s, loading: false, bundleError: a.error, playing: false };
    case 'run':
      return moved({ ...s, runId: a.runId }, a.cursor ?? -1, false, { playing: false, selection: null });
    case 'seek':
      return moved(s, a.cursor, false, { playing: false });
    case 'step':
      return moved(s, s.cursor + a.delta, true, { playing: false });
    case 'tick':
      if (!s.playing || s.cursor >= last) return { ...s, playing: false };
      return moved(s, s.cursor + 1, true, {}, 'play');
    case 'play':
      if (!run) return s;
      // Playing from the end starts over; a selection would fight the replay, so it is released.
      return s.cursor >= last ? moved(s, -1, false, { playing: true, selection: null }) : { ...s, playing: true, selection: null };
    case 'pause':
      return { ...s, playing: false };
    case 'toggle':
      return reducer(s, { type: s.playing ? 'pause' : 'play' });
    case 'speed':
      return { ...s, speed: a.speed };
    case 'select':
      return { ...s, selection: a.selection, playing: a.selection ? false : s.playing };
  }
}

function defaultRun(b: Bundle): string {
  // An experiment opens on its most informative condition; anything else on its first run.
  return (b.runs.find((r) => r.condition === 'monitored') ?? b.runs[0]).id;
}

// ---- URL <-> state -------------------------------------------------------------------------------

interface UrlState {
  view: View;
  bundle: string | null;
  run: string | null;
  step: number | null;
  sel: Selection | null;
}

export function readUrl(search = location.search): UrlState {
  const p = new URLSearchParams(search);
  const view = p.get('view');
  const step = p.get('step');
  const sel = p.get('sel');
  const [kind, ...rest] = (sel ?? '').split(':');
  return {
    // No view in the URL means a first visit: start on the landing page.
    view: view === 'compare' || view === 'graph' || view === 'replay' ? view : 'home',
    bundle: p.get('bundle'),
    run: p.get('run'),
    step: step !== null && /^-?\d+$/.test(step) ? Number(step) - 1 : null,
    sel: sel && ['event', 'actor', 'record', 'claim'].includes(kind) && rest.length ? { kind: kind as Selection['kind'], id: rest.join(':') } : null,
  };
}

function writeUrl(s: AppState) {
  const p = new URLSearchParams();
  p.set('view', s.view);
  if (s.bundleId) p.set('bundle', s.bundleId);
  if (s.runId) p.set('run', s.runId);
  p.set('step', String(s.cursor + 1));
  if (s.selection) p.set('sel', `${s.selection.kind}:${s.selection.id}`);
  const next = `?${p.toString()}`;
  if (next !== location.search) history.replaceState(null, '', next);
}

// ---- provider ------------------------------------------------------------------------------------

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function initialState(url = readUrl()): AppState {
  return {
    view: url.view,
    bundles: null,
    listError: null,
    bundleId: url.bundle,
    bundle: null,
    loading: false,
    bundleError: null,
    runId: url.run,
    cursor: -1,
    playing: false,
    speed: 1,
    transition: { nonce: 0, animate: false },
    selection: url.sel,
  };
}

export async function fetchBundle(id: string, signal?: AbortSignal): Promise<Bundle> {
  const res = await fetch(`/api/bundles/${encodeURIComponent(id)}`, { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `The server answered ${res.status}.`);
  const problems = validateBundle(body);
  if (problems.length) throw new Error(`The bundle failed validation: ${problems.slice(0, 3).join(' ')}`);
  return body as Bundle;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());

  // Bundle list, then the bundle named in the URL (or the first valid one).
  useEffect(() => {
    const ctrl = new AbortController();
    const url = readUrl();
    (async () => {
      let list: BundleSummary[];
      try {
        const res = await fetch('/api/bundles', { signal: ctrl.signal });
        if (!res.ok) throw new Error(`The server answered ${res.status}.`);
        list = await res.json();
        dispatch({ type: 'bundles', list });
      } catch (e) {
        if (!ctrl.signal.aborted) dispatch({ type: 'bundles-failed', error: (e as Error).message || 'The bundle list could not be fetched.' });
        return;
      }
      const wanted = list.find((b) => b.id === url.bundle && !b.problems.length) ?? list.find((b) => !b.problems.length);
      if (!wanted) return;
      dispatch({ type: 'open-bundle', id: wanted.id });
      try {
        const bundle = await fetchBundle(wanted.id, ctrl.signal);
        const sameBundle = wanted.id === url.bundle;
        dispatch({ type: 'bundle-loaded', bundle, runId: sameBundle ? url.run : null, cursor: sameBundle && url.step !== null ? url.step : undefined });
      } catch (e) {
        if (!ctrl.signal.aborted) dispatch({ type: 'bundle-failed', error: (e as Error).message });
      }
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (state.bundle) writeUrl(state);
  }, [state.view, state.bundleId, state.runId, state.cursor, state.selection, state.bundle]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
