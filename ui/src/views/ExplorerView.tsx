import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Inspector } from '../components/Inspector.tsx';
import { REL_TYPES, nodeKey, projectRun, projectionAt, type GNode, type Projection, type RelType } from '../model/graph.ts';
import { deriveState } from '../model/replay.ts';
import type { Bundle, Run } from '../model/types.ts';
import { useStore, type Selection } from '../state/store.tsx';

type Source =
  | { kind: 'checking' }
  | { kind: 'neo4j'; uri: string; mismatch: string | null }
  | { kind: 'offline'; reason: string }
  | { kind: 'not-loaded'; uri: string };

const REL_WORD: Record<RelType, string> = {
  DID: 'did (actor → event)',
  TO: 'to (event → actor)',
  ON: 'on (event → record)',
  ABOUT: 'about (event → claim)',
  CITES: 'cites evidence',
  DEPENDS_ON: 'depends on (event → cause)',
  FIRST_STATED_IN: 'first stated in',
};

/** Neo4j when it is connected and holds this run; otherwise the same projection computed from the bundle, labelled as such. */
function useGraphSource(bundle: Bundle, run: Run, retry: number, liveTick: number) {
  const local = useMemo(() => projectRun(bundle, run), [bundle, run]);
  const [source, setSource] = useState<Source>({ kind: 'checking' });
  const [remote, setRemote] = useState<Projection | null>(null);
  // A different run starts from scratch; a live refresh keeps what is on screen until the new read lands.
  useEffect(() => {
    setSource({ kind: 'checking' });
    setRemote(null);
  }, [bundle.id, run.id]);
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const st = await (await fetch('/api/neo4j/status', { signal: ctrl.signal })).json();
        if (st.state === 'not-configured') return setSource({ kind: 'offline', reason: 'Neo4j is not configured on this server.' });
        if (st.state === 'unreachable') return setSource({ kind: 'offline', reason: st.message });
        const loaded = (st.runs as { bundle: string; run: string }[]).some((r) => r.bundle === bundle.id && r.run === run.id);
        if (!loaded) return setSource({ kind: 'not-loaded', uri: st.uri });
        const res = await fetch(`/api/neo4j/runs/${encodeURIComponent(bundle.id)}/${encodeURIComponent(run.id)}`, { signal: ctrl.signal });
        if (!res.ok) return setSource({ kind: 'offline', reason: (await res.json()).error ?? 'The run could not be read from Neo4j.' });
        const p = (await res.json()) as Projection;
        // The database copy must match the bundle it was loaded from; say so if it does not.
        const mismatch = p.nodes.length !== local.nodes.length || p.edges.length !== local.edges.length ? `The database holds ${p.nodes.length} nodes and ${p.edges.length} relationships; the bundle has ${local.nodes.length} and ${local.edges.length}. Reload with npm run neo4j:load.` : null;
        setRemote(p);
        setSource({ kind: 'neo4j', uri: st.uri, mismatch });
      } catch {
        if (!ctrl.signal.aborted) setSource({ kind: 'offline', reason: 'The app server did not answer.' });
      }
    })();
    return () => ctrl.abort();
  }, [bundle.id, run.id, retry, local, liveTick]);
  return { source, projection: remote ?? local };
}

export default function ExplorerView({ bundle, run }: { bundle: Bundle; run: Run }) {
  const { state, dispatch } = useStore();
  const [retry, setRetry] = useState(0);
  // While a run is live, re-read the database copy every few seconds so the graph keeps up.
  const [liveTick, setLiveTick] = useState(0);
  useEffect(() => {
    if (!state.live) return;
    const t = window.setInterval(() => setLiveTick((n) => n + 1), 3500);
    return () => window.clearInterval(t);
  }, [state.live]);
  const { source, projection } = useGraphSource(bundle, run, retry, liveTick);
  const [types, setTypes] = useState<Set<RelType>>(() => new Set(REL_TYPES.filter((t) => t !== 'FIRST_STATED_IN')));
  const [uptoCursor, setUptoCursor] = useState(true);
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'lanes' | 'force'>('force');
  const [trace, setTrace] = useState<{ dir: 'up' | 'down'; from: string } | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const rs = useMemo(() => deriveState(run, state.cursor), [run, state.cursor]);

  const visible = useMemo(() => {
    const p = uptoCursor ? projectionAt(projection, state.cursor) : projection;
    return { ...p, edges: p.edges.filter((e) => types.has(e.type)) };
  }, [projection, uptoCursor, state.cursor, types]);

  const selectedKey = state.selection ? nodeKey(bundle.id, run.id, state.selection.id) : rs.current ? nodeKey(bundle.id, run.id, rs.current.id) : null;

  // Create cytoscape once.
  useEffect(() => {
    if (!container.current) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    const inst = cytoscape({
      container: container.current,
      minZoom: 0.15,
      maxZoom: 3,
      boxSelectionEnabled: false,
      style: [
        { selector: 'node', style: { label: 'data(name)', color: v('--ink'), 'font-family': 'Archivo Variable, sans-serif', 'font-size': 11, 'text-valign': 'bottom', 'text-margin-y': 6, 'text-outline-color': v('--bg'), 'text-outline-width': 3, 'background-color': '#2a2723', 'border-width': 1.5, 'border-color': v('--ink-muted'), width: 34, height: 34 } },
        { selector: 'node[label="Actor"][kind="monitor"]', style: { shape: 'diamond', width: 40, height: 40, 'border-color': v('--ink') } },
        { selector: 'node[label="Record"]', style: { shape: 'round-rectangle', width: 62, height: 24, 'font-family': 'JetBrains Mono Variable, monospace', 'font-size': 10, 'text-valign': 'center', 'text-margin-y': 0, 'background-color': '#24221f' } },
        { selector: 'node[label="Record"][?planted]', style: { 'border-color': v('--claim') } },
        { selector: 'node[label="Claim"]', style: { shape: 'tag', width: 40, height: 22, 'background-color': v('--claim'), 'border-width': 0, color: v('--claim-ink'), 'text-valign': 'center', 'text-margin-y': 0, 'text-outline-width': 0, 'font-weight': 700 } },
        { selector: 'node[label="Event"]', style: { width: 14, height: 14, 'border-width': 0, 'font-size': 9, color: v('--ink-muted'), 'background-color': v('--ink-faint') } },
        { selector: 'node[channel="claim"], node[channel="claim-action"]', style: { 'background-color': v('--claim') } },
        { selector: 'node[channel="correct"], node[channel="intervene"], node[channel="corrective-action"], node[channel="dispute"]', style: { 'background-color': v('--correction') } },
        { selector: 'node[channel="action"]', style: { 'background-color': v('--ink'), shape: 'rectangle' } },
        { selector: 'node[channel="claim-action"], node[channel="corrective-action"]', style: { shape: 'rectangle' } },
        { selector: 'node[channel="check"]', style: { shape: 'diamond', width: 18, height: 18, 'background-color': v('--ink-muted') } },
        { selector: 'node[verdict="contradicted"]', style: { 'background-color': v('--contradicted') } },
        { selector: 'node[verdict="supported"]', style: { 'background-color': v('--supported') } },
        { selector: 'edge', style: { width: 1.2, 'line-color': '#4b463f', 'target-arrow-color': '#4b463f', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.7, 'curve-style': 'bezier', opacity: 0.85 } },
        { selector: 'edge[type="DID"]', style: { 'line-color': '#3a3631', 'target-arrow-shape': 'none' } },
        { selector: 'edge[type="ABOUT"], edge[type="FIRST_STATED_IN"]', style: { 'line-color': v('--claim'), 'target-arrow-color': v('--claim'), 'line-style': 'dashed', 'line-dash-pattern': [4, 4], opacity: 0.35 } },
        { selector: 'edge[type="CITES"]', style: { 'line-color': v('--contradicted'), 'target-arrow-color': v('--contradicted'), 'line-style': 'dashed' } },
        { selector: 'edge[type="CITES"][stance="supports"]', style: { 'line-color': v('--supported'), 'target-arrow-color': v('--supported') } },
        { selector: 'edge[type="DEPENDS_ON"]', style: { 'line-color': v('--ink-faint'), 'target-arrow-color': v('--ink-faint'), 'line-style': 'dotted', 'curve-style': 'unbundled-bezier', 'control-point-distances': [28], 'control-point-weights': [0.5] } },
        { selector: '.dim', style: { opacity: 0.12 } },
        { selector: 'node.hit', style: { 'border-width': 3, 'border-color': v('--ink'), 'underlay-color': v('--ink'), 'underlay-opacity': 0.12, 'underlay-padding': 8 } },
        { selector: 'edge.hit', style: { width: 2.4, opacity: 1 } },
        { selector: 'node.focus', style: { 'border-width': 3, 'border-color': v('--focus'), 'underlay-color': v('--claim'), 'underlay-opacity': 0.18, 'underlay-padding': 10 } },
      ],
    });
    cy.current = inst;
    const ro = new ResizeObserver(() => inst.resize());
    ro.observe(container.current);
    return () => {
      ro.disconnect();
      inst.destroy();
      cy.current = null;
    };
  }, []);

  const onTap = useRef<(n: GNode) => void>(() => {});
  onTap.current = (n: GNode) => {
    const kind: Selection['kind'] = n.label === 'Event' ? 'event' : n.label === 'Actor' ? 'actor' : n.label === 'Record' ? 'record' : 'claim';
    dispatch({ type: 'select', selection: { kind, id: n.id } });
  };
  useEffect(() => {
    const inst = cy.current;
    if (!inst) return;
    const h = (e: cytoscape.EventObject) => onTap.current(e.target.data('node'));
    inst.on('tap', 'node', h);
    return () => {
      inst.off('tap', 'node', h);
    };
  }, []);

  // Elements and layout.
  useEffect(() => {
    const inst = cy.current;
    if (!inst) return;
    const els: ElementDefinition[] = [
      ...visible.nodes.map((n) => ({ group: 'nodes' as const, data: { id: n.key, name: n.label === 'Event' ? String(n.seq! + 1) : n.name, label: n.label, node: n, ...flat(n.props) }, position: lanePosition(n, run) })),
      ...visible.edges.map((e) => ({ group: 'edges' as const, data: { id: e.key, source: e.from, target: e.to, type: e.type, ...flat(e.props) } })),
    ];
    inst.batch(() => {
      inst.elements().remove();
      inst.add(els);
    });
    if (layout === 'lanes') inst.layout({ name: 'preset', fit: true, padding: 60 }).run();
    else inst.layout({ name: 'cose', animate: false, randomize: false, nodeRepulsion: () => 14000, idealEdgeLength: () => 80, nodeOverlap: 20, gravity: 0.6, numIter: 1500, padding: 40 } as cytoscape.LayoutOptions).run();
  }, [visible, layout, run]);

  // Selection, search and trace highlighting.
  useEffect(() => {
    const inst = cy.current;
    if (!inst) return;
    inst.elements().removeClass('dim hit focus');
    const term = search.trim().toLowerCase();
    let hits = inst.collection();
    if (term) {
      hits = inst.nodes().filter((n) => JSON.stringify(n.data('node')).toLowerCase().includes(term));
    } else if (trace) {
      hits = traceFrom(inst, trace.from, trace.dir);
    } else if (state.selection && selectedKey) {
      // Only an explicit selection dims the rest; following the replay just marks the current event.
      const n = inst.getElementById(selectedKey);
      if (n.nonempty()) hits = n.closedNeighborhood();
    }
    if (hits.nonempty()) {
      inst.elements().addClass('dim');
      hits.removeClass('dim').addClass('hit');
      hits.edgesWith(hits).removeClass('dim').addClass('hit');
    }
    if (selectedKey) inst.getElementById(selectedKey).removeClass('dim').addClass('focus');
  }, [visible, search, selectedKey, trace, state.selection]);

  const toggleType = (t: RelType) => setTypes((s) => {
    const n = new Set(s);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    return n;
  });
  const selectedEvent = state.selection?.kind === 'event' ? state.selection.id : !state.selection ? rs.current?.id : null;

  return (
    <main className="explorer">
      <div className="explorer-canvas stage" ref={container} role="img" aria-label={`Graph of ${visible.nodes.length} nodes and ${visible.edges.length} relationships. The relationship list in the left panel gives keyboard access.`} />
      <aside className="explorer-panel glass" aria-label="Graph controls">
        <SourceBadge source={source} onRetry={() => setRetry((r) => r + 1)} />
        <label className="search">
          <span className="sr-only">Search the graph</span>
          <input type="search" placeholder="Search names, text, ids" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <fieldset>
          <legend>Relationships</legend>
          {REL_TYPES.map((t) => (
            <label key={t} className="check">
              <input type="checkbox" checked={types.has(t)} onChange={() => toggleType(t)} />
              <span>{REL_WORD[t]}</span>
              <span className="count">{projection.edges.filter((e) => e.type === t).length}</span>
            </label>
          ))}
        </fieldset>
        <label className="check">
          <input type="checkbox" checked={uptoCursor} onChange={(e) => setUptoCursor(e.target.checked)} />
          <span>Only events up to replay step {state.cursor + 1}</span>
        </label>
        <div className="explorer-row">
          <label className="picker">
            <span className="sr-only">Layout</span>
            <select value={layout} onChange={(e) => setLayout(e.target.value as 'lanes' | 'force')}>
              <option value="force">Force-directed</option>
              <option value="lanes">Lanes: time by actor</option>
            </select>
          </label>
          <button type="button" className="icon-btn" aria-label="Fit graph to view" onClick={() => cy.current?.fit(undefined, 50)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7V3h4M15 7V3h-4M3 11v4h4M15 11v4h-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        </div>
        <div className="explorer-row">
          <button type="button" className="btn btn--ghost btn--sm" disabled={!selectedEvent} onClick={() => selectedEvent && setTrace(trace?.dir === 'up' ? null : { dir: 'up', from: nodeKey(bundle.id, run.id, selectedEvent) })} aria-pressed={trace?.dir === 'up'}>
            Trace causes
          </button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={!selectedEvent} onClick={() => selectedEvent && setTrace(trace?.dir === 'down' ? null : { dir: 'down', from: nodeKey(bundle.id, run.id, selectedEvent) })} aria-pressed={trace?.dir === 'down'}>
            Trace effects
          </button>
        </div>
        <p className="muted small">
          {visible.nodes.length} nodes, {visible.edges.length} relationships. Click a node to inspect it; the replay keeps the same selection.
        </p>
        <details className="rel-list">
          <summary>Relationship list ({visible.edges.length})</summary>
          <ul>
            {visible.edges.map((e) => {
              const from = visible.nodes.find((n) => n.key === e.from);
              const to = visible.nodes.find((n) => n.key === e.to);
              return (
                <li key={e.key}>
                  <button type="button" className="text-btn" onClick={() => from && onTap.current(from)}>
                    {from?.name}
                  </button>{' '}
                  <span className="muted">{e.type}</span>{' '}
                  <button type="button" className="text-btn" onClick={() => to && onTap.current(to)}>
                    {to?.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      </aside>
      <Inspector bundle={bundle} run={run} state={rs} className="explorer-inspector" />
    </main>
  );
}

function SourceBadge({ source, onRetry }: { source: Source; onRetry: () => void }) {
  if (source.kind === 'checking') return <p className="source source--checking">Checking Neo4j…</p>;
  if (source.kind === 'neo4j')
    return (
      <div className="source source--live">
        <p>
          <i aria-hidden="true" />
          <img src="/logos/neo4j.svg" alt="" width="15" height="15" />
          Neo4j, read-only
          <span className="mono">{source.uri}</span>
        </p>
        {source.mismatch && <p className="source-warn">{source.mismatch}</p>}
      </div>
    );
  return (
    <div className="source source--offline">
      <p>
        <i aria-hidden="true" />
        {source.kind === 'not-loaded' ? 'Neo4j is up but this run is not loaded.' : 'Neo4j offline.'}
      </p>
      <p className="muted small">{source.kind === 'not-loaded' ? 'Run npm run neo4j:load in ui/. ' : `${source.reason} `}Showing the same records drawn from the bundle file.</p>
      <button type="button" className="text-btn small" onClick={onRetry}>
        Check again
      </button>
    </div>
  );
}

/** Time runs left to right; each actor has a lane; records sit above, claims at the top. */
function lanePosition(n: GNode, run: Run): { x: number; y: number } {
  const lane = (id: string) => run.actors.findIndex((a) => a.id === id);
  const X = 92;
  if (n.label === 'Actor') return { x: -40, y: lane(n.id) * 84 };
  if (n.label === 'Event') {
    const e = run.events.find((x) => x.id === n.id);
    return { x: 80 + (n.seq ?? 0) * X, y: (e ? lane(e.actor) : 0) * 84 };
  }
  if (n.label === 'Record') {
    const first = run.events.find((e) => e.target?.kind === 'record' && e.target.id === n.id);
    const i = run.records.findIndex((r) => r.id === n.id);
    return { x: 80 + (first?.seq ?? i) * X, y: -110 - (i % 2) * 40 };
  }
  return { x: 80 + (n.seq ?? 0) * X, y: -210 };
}

function traceFrom(inst: Core, key: string, dir: 'up' | 'down') {
  let frontier = inst.getElementById(key);
  let found = frontier;
  for (let i = 0; i < 64 && frontier.nonempty(); i++) {
    const edges = dir === 'up' ? frontier.outgoers('edge[type="DEPENDS_ON"]') : frontier.incomers('edge[type="DEPENDS_ON"]');
    const next = (dir === 'up' ? edges.targets() : edges.sources()).difference(found);
    found = found.union(edges).union(next);
    frontier = next;
  }
  return found;
}

function flat(props: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(Object.entries(props).filter(([k]) => !['id', 'source', 'target', 'label'].includes(k)));
}
