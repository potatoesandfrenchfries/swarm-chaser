import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import type { BundleSummary } from '../../server/bundles.ts';
import type { LiveTask } from '../../server/live.ts';
import { clampCursor } from '../model/replay.ts';
import type { Bundle, Run } from '../model/types.ts';
import { validateBundle, validateLiveBundle } from '../model/validate.ts';

/**
 * Landing site pages: home, demo, results. Dashboard pages, behind the sidebar: the overview, the
 * set-up for a new run (playground), and one run seen three ways: as a chat, a log or a graph.
 */
export type View = 'home' | 'demo' | 'results' | 'overview' | 'playground' | 'settings' | 'chat' | 'activity' | 'graph';
export const SITE_VIEWS: View[] = ['home', 'demo', 'results'];
export const RUN_VIEWS: View[] = ['chat', 'activity', 'graph'];
const VIEWS: View[] = [...SITE_VIEWS, 'overview', 'playground', 'settings', ...RUN_VIEWS];
export type Selection = { kind: 'event' | 'actor' | 'record' | 'claim'; id: string };

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
  /** The step the inspector reads up to; a run opens on its last step. */
  cursor: number;
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
  /** The task and set-up that started this run, when the dashboard started it. */
  task: LiveTask | null;
}

export type Action =
  | { type: 'view'; view: View }
  | { type: 'bundles'; list: BundleSummary[] }
  | { type: 'bundles-failed'; error: string }
  | { type: 'open-bundle'; id: string; runId?: string }
  | { type: 'bundle-loaded'; bundle: Bundle; runId?: string | null; cursor?: number; fromUrl?: boolean }
  | { type: 'bundle-failed'; error: string }
  | { type: 'run'; runId: string; cursor?: number }
  | { type: 'seek'; cursor: number }
  | { type: 'step'; delta: number }
  | { type: 'select'; selection: Selection | null }
  | { type: 'open-live'; id: string }
  | { type: 'new-run' }
  | { type: 'live-snapshot'; bundle: Bundle; problems: string[]; ended: boolean; task: LiveTask | null }
  | { type: 'live-append'; kind: 'event' | 'actor' | 'record' | 'claim'; item: unknown }
  | { type: 'live-status'; status: LiveState['status'] }
  | { type: 'live-neo4j'; state: LiveState['neo4j'] }
  | { type: 'live-problem'; message: string }
  | { type: 'live-follow' }
  | { type: 'live-pause' };

export function currentRun(s: Pick<AppState, 'bundle' | 'runId'>): Run | null {
  return s.bundle?.runs.find((r) => r.id === s.runId) ?? null;
}

/** Stop watching a live run and go back to the recorded examples, which the landing pages and the set-up read. */
function leaveLive(s: AppState): AppState {
  if (!s.live) return s;
  const example = s.bundles?.find((b) => !b.problems.length)?.id ?? null;
  return { ...s, live: null, bundle: null, bundleId: example, runId: null, loading: Boolean(example), selection: null };
}

function moved(s: AppState, cursor: number, extra: Partial<AppState> = {}): AppState {
  const run = currentRun(s);
  return { ...s, ...extra, cursor: run ? clampCursor(run, cursor) : -1 };
}

const lastStep = (r: Run | undefined) => (r ? r.events.length - 1 : -1);

export function reducer(s: AppState, a: Action): AppState {
  const run = currentRun(s);
  const last = run ? run.events.length - 1 : -1;
  switch (a.type) {
    case 'view':
      return { ...(SITE_VIEWS.includes(a.view) || a.view === 'playground' ? leaveLive(s) : s), view: a.view };
    case 'bundles':
      return { ...s, bundles: a.list, listError: null };
    case 'bundles-failed':
      return { ...s, listError: a.error };
    case 'open-bundle': {
      const view = RUN_VIEWS.includes(s.view) || !a.runId ? s.view : 'chat';
      // The bundle is already open: only the run changes.
      if (!s.live && s.bundle?.id === a.id) return a.runId ? reducer({ ...s, view }, { type: 'run', runId: a.runId }) : { ...s, view };
      return { ...s, view, bundleId: a.id, runId: a.runId ?? null, loading: true, bundleError: null, live: null };
    }
    case 'bundle-loaded': {
      const runId = a.runId && a.bundle.runs.some((r) => r.id === a.runId) ? a.runId : defaultRun(a.bundle);
      const next = { ...s, bundle: a.bundle, bundleId: a.bundle.id, loading: false, bundleError: null, runId };
      // A selection survives only when this load came from a link that named it.
      return moved(next, a.cursor ?? lastStep(a.bundle.runs.find((r) => r.id === runId)), { selection: a.fromUrl ? s.selection : null });
    }
    case 'bundle-failed':
      return { ...s, loading: false, bundleError: a.error };
    case 'run':
      return moved({ ...s, runId: a.runId }, a.cursor ?? lastStep(s.bundle?.runs.find((r) => r.id === a.runId)), { selection: null });
    case 'seek': {
      const next = moved(s, a.cursor);
      return s.live ? { ...next, live: { ...s.live, follow: false } } : next;
    }
    case 'step': {
      const next = moved(s, s.cursor + a.delta);
      return s.live ? { ...next, live: { ...s.live, follow: false } } : next;
    }
    case 'select':
      return { ...s, selection: a.selection };
    case 'open-live':
      // Drop whatever was open so the previous run never shows under the new run's name.
      return { ...s, view: RUN_VIEWS.includes(s.view) ? s.view : 'chat', bundle: null, runId: null, loading: true, bundleError: null, selection: null, live: { id: a.id, status: 'connecting', follow: true, problems: [], neo4j: 'unknown', task: null } };
    case 'new-run':
      return { ...leaveLive(s), view: 'playground' };
    case 'live-snapshot': {
      if (!s.live) return s;
      const next = reducer({ ...s, live: null }, { type: 'bundle-loaded', bundle: a.bundle, runId: a.bundle.runs[0].id, cursor: a.bundle.runs[0].events.length - 1 });
      return { ...next, live: { ...s.live, status: a.ended ? 'ended' : 'live', follow: true, problems: a.problems, task: a.task } };
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
      // Following: ride the newest step.
      return a.kind === 'event' && s.live.follow ? moved(next, r.events.length - 1) : next;
    }
    case 'live-status':
      // A finished run stays finished; a late "quiet" timer or reconnect must not reopen it.
      return s.live && s.live.status !== 'ended' ? { ...s, live: { ...s.live, status: a.status } } : s;
    case 'live-neo4j':
      return s.live ? { ...s, live: { ...s.live, neo4j: a.state } } : s;
    case 'live-problem':
      return s.live ? { ...s, live: { ...s.live, problems: [...s.live.problems, a.message] } } : s;
    case 'live-pause':
      return s.live ? { ...s, live: { ...s.live, follow: false } } : s;
    case 'live-follow':
      return s.live ? moved({ ...s, live: { ...s.live, follow: true } }, last) : s;
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
    view: VIEWS.includes(view as View) ? (view as View) : 'home',
    live: p.get('live'),
    bundle: p.get('bundle'),
    run: p.get('run'),
    step: step !== null && /^-?\d+$/.test(step) ? Number(step) - 1 : null,
    sel: sel && ['event', 'actor', 'record', 'claim'].includes(kind) && rest.length ? { kind: kind as Selection['kind'], id: rest.join(':') } : null,
  };
}

function writeUrl(s: AppState) {
  const p = new URLSearchParams();
  // The landing page is plain "/"; other pages name themselves, and only a run view says which run it shows.
  // The step is left out so the address stays short; an old link that names one still opens there (see readUrl).
  if (s.view !== 'home') p.set('view', s.view);
  if (RUN_VIEWS.includes(s.view)) {
    if (s.live) p.set('live', s.live.id);
    else if (s.bundleId) p.set('bundle', s.bundleId);
    if (s.runId) p.set('run', s.runId);
    if (s.selection) p.set('sel', `${s.selection.kind}:${s.selection.id}`);
  }
  const query = p.toString();
  const search = query ? `?${query}` : '';
  if (search !== location.search) history.replaceState(null, '', `${location.pathname}${search}${location.hash}`);
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
    const runId = state.runId;
    fetchBundle(id, ctrl.signal)
      .then((bundle) => {
        const url = firstUrl.current;
        firstUrl.current = null;
        const fromUrl = url && url.bundle === id;
        dispatch({ type: 'bundle-loaded', bundle, runId: fromUrl ? url.run : runId, cursor: fromUrl && url.step !== null ? url.step : undefined, fromUrl: Boolean(fromUrl) });
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) dispatch({ type: 'bundle-failed', error: (e as Error).message });
      });
    return () => ctrl.abort();
  }, [state.loading, state.live, state.bundleId, state.bundle?.id]);

  useEffect(() => {
    if (state.bundle) writeUrl(state);
  }, [state.view, state.bundleId, state.runId, state.selection, state.bundle, state.live?.id]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
