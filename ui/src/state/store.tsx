import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import type { BundleSummary } from '../../server/bundles.ts';
import { clampCursor } from '../model/replay.ts';
import type { Bundle, Run } from '../model/types.ts';
import { validateBundle, validateLiveBundle } from '../model/validate.ts';

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
  /** Set while watching a live run. `follow` keeps the playhead on the newest step. */
  live: LiveState | null;
}

export interface LiveState {
  id: string;
  status: 'connecting' | 'live' | 'quiet' | 'lost' | 'ended';
  follow: boolean;
  problems: string[];
  neo4j: 'unknown' | 'synced' | 'failed';
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
  | { type: 'select'; selection: Selection | null }
  | { type: 'open-live'; id: string }
  | { type: 'live-snapshot'; bundle: Bundle; problems: string[] }
  | { type: 'live-append'; kind: 'event' | 'actor' | 'record' | 'claim'; item: unknown }
  | { type: 'live-status'; status: LiveState['status'] }
  | { type: 'live-neo4j'; state: LiveState['neo4j'] }
  | { type: 'live-problem'; message: string }
  | { type: 'live-follow' };

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
      return { ...s, bundleId: a.id, loading: true, bundleError: null, playing: false, live: null };
    case 'bundle-loaded': {
      const runId = a.runId && a.bundle.runs.some((r) => r.id === a.runId) ? a.runId : defaultRun(a.bundle);
      const next = { ...s, bundle: a.bundle, bundleId: a.bundle.id, loading: false, bundleError: null, runId, playing: false };
      return moved(next, a.cursor ?? -1, false, { selection: a.cursor === undefined ? null : s.selection });
    }
    case 'bundle-failed':
      return { ...s, loading: false, bundleError: a.error, playing: false };
    case 'run':
      return moved({ ...s, runId: a.runId }, a.cursor ?? -1, false, { playing: false, selection: null });
    case 'seek': {
      const next = moved(s, a.cursor, false, { playing: false });
      return s.live ? { ...next, live: { ...s.live, follow: next.cursor >= last } } : next;
    }
    case 'step': {
      const next = moved(s, s.cursor + a.delta, true, { playing: false });
      return s.live ? { ...next, live: { ...s.live, follow: next.cursor >= last } } : next;
    }
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
    case 'open-live':
      return { ...s, view: s.view === 'home' ? 'replay' : s.view, loading: true, bundleError: null, playing: false, selection: null, live: { id: a.id, status: 'connecting', follow: true, problems: [], neo4j: 'unknown' } };
    case 'live-snapshot': {
      if (!s.live) return s;
      const next = reducer({ ...s, live: null }, { type: 'bundle-loaded', bundle: a.bundle, runId: a.bundle.runs[0].id, cursor: a.bundle.runs[0].events.length - 1 });
      return { ...next, live: { ...s.live, status: 'live', follow: true, problems: a.problems } };
    }
    case 'live-append': {
      if (!s.live || !s.bundle || !run) return s;
      const r = { ...run };
      if (a.kind === 'event') {
        const e = a.item as Run['events'][number];
        if (e.seq !== r.events.length) return { ...s, live: { ...s.live, problems: [...s.live.problems, `Step ${e.seq + 1} arrived out of order and was skipped.`] } };
        r.events = [...r.events, e];
      } else if (a.kind === 'actor') r.actors = [...r.actors, a.item as Run['actors'][number]];
      else if (a.kind === 'record') r.records = [...r.records, a.item as Run['records'][number]];
      else r.claims = [...r.claims, a.item as Run['claims'][number]];
      const problems = validateLiveBundle({ ...s.bundle, runs: [r] });
      if (problems.length) return { ...s, live: { ...s.live, problems: [...s.live.problems, problems[0]] } };
      const next: AppState = { ...s, bundle: { ...s.bundle, runs: [r] }, live: { ...s.live, status: 'live' } };
      // Following: ride the newest step and animate it, as if playing.
      return a.kind === 'event' && s.live.follow ? moved(next, r.events.length - 1, true, {}, 'play') : next;
    }
    case 'live-status':
      return s.live ? { ...s, live: { ...s.live, status: a.status } } : s;
    case 'live-neo4j':
      return s.live ? { ...s, live: { ...s.live, neo4j: a.state } } : s;
    case 'live-problem':
      return s.live ? { ...s, live: { ...s.live, problems: [...s.live.problems, a.message] } } : s;
    case 'live-follow':
      return s.live ? moved({ ...s, live: { ...s.live, follow: true } }, last, false) : s;
  }
}

function defaultRun(b: Bundle): string {
  // An experiment opens on its most informative condition; anything else on its first run.
  return (b.runs.find((r) => r.condition === 'monitored') ?? b.runs[0]).id;
}

// ---- URL <-> state -------------------------------------------------------------------------------

interface UrlState {
  view: View;
  live: string | null;
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
    live: p.get('live'),
    bundle: p.get('bundle'),
    run: p.get('run'),
    step: step !== null && /^-?\d+$/.test(step) ? Number(step) - 1 : null,
    sel: sel && ['event', 'actor', 'record', 'claim'].includes(kind) && rest.length ? { kind: kind as Selection['kind'], id: rest.join(':') } : null,
  };
}

function writeUrl(s: AppState) {
  const p = new URLSearchParams();
  p.set('view', s.view);
  if (s.live) p.set('live', s.live.id);
  else if (s.bundleId) p.set('bundle', s.bundleId);
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
    live: null,
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

  // Bundle list, then the bundle (or live run) named in the URL, or the first valid one.
  const firstUrl = useRef<UrlState | null>(readUrl());
  useEffect(() => {
    const ctrl = new AbortController();
    const url = firstUrl.current!;
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
      if (url.live) return dispatch({ type: 'open-live', id: url.live });
      const wanted = list.find((b) => b.id === url.bundle && !b.problems.length) ?? list.find((b) => !b.problems.length);
      if (wanted) dispatch({ type: 'open-bundle', id: wanted.id });
    })();
    return () => ctrl.abort();
  }, []);

  // Whenever a bundle is asked for (first load or the header's picker), fetch it. Live runs load over their stream instead.
  useEffect(() => {
    if (!state.loading || state.live || !state.bundleId || state.bundle?.id === state.bundleId) return;
    const ctrl = new AbortController();
    const id = state.bundleId;
    fetchBundle(id, ctrl.signal)
      .then((bundle) => {
        const url = firstUrl.current;
        firstUrl.current = null;
        const fromUrl = url && url.bundle === id;
        dispatch({ type: 'bundle-loaded', bundle, runId: fromUrl ? url.run : null, cursor: fromUrl && url.step !== null ? url.step : undefined });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) dispatch({ type: 'bundle-failed', error: (e as Error).message });
      });
    return () => ctrl.abort();
  }, [state.loading, state.live, state.bundleId, state.bundle?.id]);

  useEffect(() => {
    if (state.bundle) writeUrl(state);
  }, [state.view, state.bundleId, state.runId, state.cursor, state.selection, state.bundle, state.live?.id]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
