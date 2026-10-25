import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, BaseEdge, Handle, Position, getSmoothStepPath, useNodesState, type Node, type NodeProps, type Edge, type EdgeProps, type ReactFlowInstance } from '@xyflow/react';
import { Maximize, Minus, Plus, RotateCcw } from 'lucide-react';
import { Avatar, recordIcon } from './Avatar.tsx';
import type { ReplayState, EdgeState } from '../model/replay.ts';
import type { Run } from '../model/types.ts';
import { networkLayout } from '../lib/networkLayout.ts';
import { createNetworkRouter } from '../lib/networkRoutes.ts';
import '@xyflow/react/dist/style.css';

export interface NetworkSelection { kind: 'actor' | 'record'; id: string; }
type EntityData = { run: Run; ref: NetworkSelection | null; name: string; status: string; active: boolean; tone: string; select: (ref: NetworkSelection, trigger: HTMLElement) => void };
type EntityNode = Node<EntityData, 'entity'>;
type RouteData = { path: string; tone: string; active: boolean; motion: boolean; duration: number; event: string; topology?: boolean; dragging: boolean };
type RouteEdge = Edge<RouteData, 'route'>;
const FIT_OPTIONS = { padding: .12, minZoom: .08, maxZoom: 1 } as const;
const SIDES = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom };

function Entity({ data }: NodeProps<EntityNode>) {
  const actor = data.ref?.kind === 'actor';
  const record = data.ref?.kind === 'record' ? data.run.records.find((r) => r.id === data.ref!.id) : null;
  const Icon = recordIcon(record);
  return <div className={`flow-entity ${actor ? 'flow-agent' : 'attachment flow-record'} tone-${data.tone}${record?.planted ? ' attachment--planted' : ''}${data.active ? ' is-active' : ''}`}>
    {Object.entries(SIDES).map(([side, position]) => <Fragment key={side}><Handle type="source" id={`s-${side}`} position={position} /><Handle type="target" id={`t-${side}`} position={position} /></Fragment>)}
    {actor ? <Avatar run={data.run} actorId={data.ref!.id} /> : <Icon size={22} aria-hidden="true" />}
    {data.ref ? <button type="button" className={`nodrag ${actor ? 'msg-name' : 'attachment-name'}`} aria-label={`Inspect ${data.name}`} onClick={(e) => { e.stopPropagation(); data.select(data.ref!, e.currentTarget); }}>{data.name}</button> : <strong>{data.name}</strong>}
    <small className="small">{data.status}</small>
  </div>;
}

function Route({ id, data, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps<RouteEdge>) {
  const motion = useRef<SVGAnimationElement | null>(null);
  const path = data?.dragging ? getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 })[0] : data?.path ?? '';
  useLayoutEffect(() => {
    if (data?.motion && !data.dragging) motion.current?.beginElement();
    return () => { motion.current?.endElement(); };
  }, [data?.event, data?.motion, data?.dragging, path]);
  if (!path) return null;
  return <g className={`flow-route tone-${data?.tone}${data?.active ? ' is-current' : ''}${data?.topology ? ' is-topology' : ''}`} data-event={data?.event}>
    <BaseEdge id={id} path={path} style={{ stroke: 'var(--route-color)', strokeWidth: data?.active ? 2 : 1.2, strokeDasharray: data?.topology ? '3 7' : undefined }} />
    {!data?.topology && <path d={path} fill="none" stroke="none" markerEnd={`url(#flow-arrow-${data?.tone})`} />}
    {data?.motion && !data.dragging && <circle key={data.event} r="4.5" className="flow-packet" fill="var(--route-color)" style={{ animationDuration: `${data.duration}ms` }}><animateMotion ref={motion} begin="indefinite" dur={`${data.duration}ms`} path={path} repeatCount="1" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".3 0 .2 1" /></circle>}
  </g>;
}
const nodeTypes = { entity: Entity };
const edgeTypes = { route: Route };

function toneOf(edge: EdgeState) {
  if (['divert', 'claim-action'].includes(edge.channel)) return 'danger';
  if (['allow', 'corrective-action'].includes(edge.channel)) return 'safe';
  if (['check', 'intervene', 'correct', 'submit', 'dispute'].includes(edge.channel)) return 'judge';
  return edge.channel === 'claim' ? 'claim' : 'neutral';
}

export function AgentNetwork({ run, replay, reduced, speed, animate = false, selection, onSelect }: {
  run: Run; replay: ReplayState; reduced: boolean; speed: number; animate?: boolean;
  selection: NetworkSelection | null; onSelect: (selection: NetworkSelection, trigger: HTMLElement) => void;
}) {
  const base = useMemo(() => networkLayout(run), [run.actors, run.records]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const layout = useMemo(() => ({ ...base, points: new Map([...base.points].map(([id, point]) => [id, positions[id] ?? point])) }), [base, positions]);
  const route = useMemo(() => createNetworkRouter(run, layout), [layout, run.actors, run.records]);
  const [instance, setInstance] = useState<ReactFlowInstance<EntityNode, RouteEdge> | null>(null);
  const [history, setHistory] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const choose = useRef(onSelect); choose.current = onSelect;
  const select = useMemo(() => (ref: NetworkSelection, trigger: HTMLElement) => choose.current(ref, trigger), []);
  const entities = useMemo<EntityNode[]>(() => {
    const nodes: EntityNode[] = run.actors.map((actor) => {
      const state = replay.actors[actor.id], judge = actor.kind !== 'agent';
      const status = judge ? state.checked.length ? 'Claim checked' : 'Monitor' : state.corrected.length ? 'Corrected' : state.said.length ? 'Passed claim' : state.exposed.length ? 'Received claim' : 'Agent';
      return { id: `actor:${actor.id}`, type: 'entity', position: base.points.get(`actor:${actor.id}`)!, origin: [.5, .255], extent: judge ? [[200, base.agentBottom + 15], [base.width - 200, base.height]] : [[225, base.agentTop], [base.width - 225, base.agentBottom]], data: { run, ref: { kind: 'actor', id: actor.id }, name: actor.name, status, active: replay.current?.actor === actor.id || replay.current?.target?.id === actor.id, tone: state.corrected.length ? 'judge' : state.exposed.length || state.said.length ? 'claim' : 'neutral', select } };
    });
    for (const record of run.records) {
      const state = replay.records[record.id];
      const status = state.effects.length ? `${state.effects.length} action${state.effects.length === 1 ? '' : 's'} ${record.kind === 'honeypot' ? 'captured' : 'executed'}` : record.planted ? 'Planted note' : ['sandbox', 'honeypot'].includes(record.kind) ? 'No actions yet' : 'Evidence';
      nodes.push({ id: `record:${record.id}`, type: 'entity', draggable: false, origin: [.5, .5], position: base.points.get(`record:${record.id}`)!, data: { run, ref: { kind: 'record', id: record.id }, name: record.label, status, active: replay.current?.target?.id === record.id, tone: state.lastChange === 'diverted' || state.lastChange === 'claim' ? 'danger' : state.lastChange === 'allowed' ? 'safe' : record.planted ? 'claim' : 'neutral', select } });
    }
    if (!run.actors.some((a) => a.kind !== 'agent')) nodes.push({ id: 'seat', type: 'entity', draggable: false, origin: [.5, .5], position: base.points.get('seat')!, data: { run, ref: null, name: 'Chaser is off', status: 'Actions run directly', tone: 'neutral', active: false, select } });
    return nodes;
  }, [run, replay, base, select]);
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>(entities);
  useEffect(() => setNodes((previous) => entities.map((node) => {
    const existing = previous.find((p) => p.id === node.id);
    return { ...node, position: existing?.position ?? node.position, measured: existing?.measured, selected: Boolean(selection && selection.id === node.data.ref?.id) };
  })), [entities, selection, setNodes]);
  const measured = nodes.length > 0 && nodes.every((node) => node.measured?.width && node.measured?.height);
  const entityIds = nodes.map((node) => node.id).join('|');
  useEffect(() => {
    if (!instance || !measured || !stage.current) return;
    let frame = 0, cancelled = false;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void instance.fitView(FIT_OPTIONS).then(() => { if (!cancelled) setReady(true); });
      });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(stage.current);
    fit();
    return () => { cancelled = true; cancelAnimationFrame(frame); observer.disconnect(); };
  }, [instance, measured, entityIds]);
  const dragging = nodes.some((node) => node.dragging);
  const edges = useMemo<RouteEdge[]>(() => {
    const result: RouteEdge[] = [];
    const judge = run.actors.find((a) => a.kind !== 'agent');
    const add = (id: string, from: NetworkSelection, to: NetworkSelection, tone: string, event: string, active: boolean, topology = false) => {
      const { d, points } = route(from, to); if (!d) return;
      const first = points[0], last = points.at(-1)!;
      const a = layout.points.get(`${from.kind}:${from.id}`)!, b = layout.points.get(`${to.kind}:${to.id}`)!;
      const port = (p: { x: number; y: number }, center: { x: number; y: number }) => Math.abs(p.x - center.x) > Math.abs(p.y - center.y) ? p.x < center.x ? 'left' : 'right' : p.y < center.y ? 'top' : 'bottom';
      result.push({ id, type: 'route', source: `${from.kind}:${from.id}`, target: `${to.kind}:${to.id}`, sourceHandle: `s-${port(first, a)}`, targetHandle: `t-${port(last, b)}`, selectable: false, data: { path: d, tone, active, topology, dragging, motion: active && animate && !reduced, duration: Math.min(1100, 1500 / speed), event } });
    };
    if (judge) for (const actor of run.actors.filter((a) => a.kind === 'agent')) add(`monitor:${actor.id}`, { kind: 'actor', id: actor.id }, { kind: 'actor', id: judge.id }, 'neutral', '', false, true);
    const unique = new Map<string, EdgeState>();
    for (const edge of replay.edges) unique.set([edge.from.id, edge.to.id].sort().join(':'), edge);
    const observed = [...unique.values()];
    const recent = new Set(observed.slice(-2).map((e) => e.key));
    for (const edge of observed) if (history || recent.has(edge.key) || ['divert', 'allow', 'claim-action'].includes(edge.channel)) add(edge.key, edge.from, edge.to, toneOf(edge), edge.events.at(-1)!, edge.events.includes(replay.current?.id ?? ''));
    return result;
  }, [run.actors, replay.edges, replay.current?.id, route, layout, animate, reduced, speed, history, dragging]);
  return <section className="network-card" aria-label="Agent network" data-step={replay.cursor + 1}>
    <header className="chat-head"><span className="chat-channel">Agent network</span><div className="graph-tools"><button type="button" className="chip-btn" aria-pressed={history} onClick={() => setHistory((h) => !h)}>History</button><button type="button" className="chip-btn" aria-label="Reset layout" onClick={() => { setPositions({}); setNodes(entities); requestAnimationFrame(() => instance?.fitView({ ...FIT_OPTIONS, duration: reduced ? 0 : 250 })); }}><RotateCcw size={15} /></button></div></header>
    <div ref={stage} className="flow-stage" data-ready={ready}><ReactFlow<EntityNode, RouteEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={(changes) => {
      onNodesChange(changes);
      const settled = changes.filter((change) => change.type === 'position' && !change.dragging && change.position);
      if (settled.length) setPositions((previous) => {
        const next = { ...previous };
        for (const change of settled) if (change.type === 'position' && change.position) next[change.id] = change.position;
        return next;
      });
    }} onInit={setInstance} onNodeDragStop={(_, node) => {
      const overlaps = nodes.some((other) => other.id !== node.id && other.data.ref?.kind === 'actor' && Math.abs(other.position.x - node.position.x) < 115 && Math.abs(other.position.y - node.position.y) < 110);
      const position = overlaps ? base.points.get(node.id)! : node.position;
      if (overlaps) setNodes((all) => all.map((n) => n.id === node.id ? { ...n, position } : n));
      setPositions((p) => ({ ...p, [node.id]: position }));
    }} nodesConnectable={false} edgesFocusable={false} deleteKeyCode={null} panActivationKeyCode={null} fitView fitViewOptions={FIT_OPTIONS} minZoom={.08} maxZoom={2} zoomOnScroll={false} preventScrolling={false} onPaneClick={() => {}}>
      <svg><defs>{['neutral', 'claim', 'judge', 'danger', 'safe'].map((tone) => <marker key={tone} id={`flow-arrow-${tone}`} viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="7" refY="4" orient="auto"><path className={`tone-${tone}`} d="M0 0 8 4 0 8Z" fill="var(--route-color)" /></marker>)}</defs></svg>
    </ReactFlow><div className="graph-zoom"><button type="button" className="chip-btn" disabled={!ready} aria-label="Zoom out" onClick={() => instance?.zoomOut({ duration: reduced ? 0 : 180 })}><Minus size={16} /></button><button type="button" className="chip-btn" disabled={!ready} aria-label="Fit graph to view" onClick={() => instance?.fitView({ ...FIT_OPTIONS, duration: reduced ? 0 : 220 })}><Maximize size={16} /></button><button type="button" className="chip-btn" disabled={!ready} aria-label="Zoom in" onClick={() => instance?.zoomIn({ duration: reduced ? 0 : 180 })}><Plus size={16} /></button></div></div>
    <footer className="chat-foot network-caption"><span className="chat-count">{replay.current?.summary ?? 'Sandbox left · agents in the middle · Chaser below · honeypot right'}</span><small className="small muted">Drag agents to arrange · pan or pinch to explore</small></footer>
  </section>;
}
