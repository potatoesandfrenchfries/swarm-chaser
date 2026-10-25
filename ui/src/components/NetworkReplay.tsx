import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Hash, Pause, Play, RotateCcw, ShieldCheck, TriangleAlert, Network, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReplayEvent, Run } from '../model/types.ts';
import { deriveState } from '../model/replay.ts';
import { decisionOf } from '../model/activity.ts';
import { useReducedMotion } from '../state/hooks.ts';
import { useGraphDisclosure } from '../state/useGraphDisclosure.ts';
import { actorName } from '../lib/words.ts';
import { Avatar } from './Avatar.tsx';
import { ChatMessage } from './ChatMessage.tsx';
import { AgentNetwork, type NetworkSelection } from './AgentNetwork.tsx';
import '../styles/network-demo.css';

export interface NetworkController {
  cursor: number; selection: NetworkSelection | null;
  seek: (cursor: number) => void; select: (selection: NetworkSelection | null) => void;
  live?: { active: boolean; ended: boolean; following: boolean; lost: boolean; follow: () => void; pause: () => void };
}

/** The original chat owns the presentation. An optional graph shares its exact cursor and clock. */
export function NetworkReplay({ run, onVersion, controller, detail, headerActions, graphVisible, onGraphVisibleChange }: {
  run: Run; claimId?: string | null; onVersion?: (version: 'planted' | 'monitored') => void;
  controller?: NetworkController; detail?: ReactNode; headerActions?: ReactNode;
  graphVisible?: boolean; onGraphVisibleChange?: (visible: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const [localCursor, setLocalCursor] = useState(reduced ? run.events.length - 1 : -1);
  const cursor = controller?.cursor ?? localCursor;
  const moveTo = (next: number) => controller ? controller.seek(next) : setLocalCursor(next);
  const [playing, setPlaying] = useState(!reduced && !controller);
  const [typing, setTyping] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [motion, setMotion] = useState(false);
  const [localGraphVisible, setLocalGraphVisible] = useState(Boolean(controller));
  const visible = graphVisible ?? localGraphVisible;
  const setVisible = onGraphVisibleChange ?? setLocalGraphVisible;
  const graph = useGraphDisclosure(visible, reduced);
  const [localSelection, setLocalSelection] = useState<NetworkSelection | null>(null);
  const selection = controller ? controller.selection : localSelection;
  const select = (next: NetworkSelection | null) => controller ? controller.select(next) : setLocalSelection(next);
  const trigger = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const replay = useMemo(() => deriveState(run, cursor), [run, cursor]);
  const following = Boolean(controller?.live?.following && controller.live.active);
  const done = cursor >= run.events.length - 1;
  const finished = done && (!controller?.live || controller.live.ended);
  const leak = replay.applied.some((e) => decisionOf(e, run) === 'leaked');
  const block = replay.applied.some((e) => e.type === 'divert');
  const allowed = replay.applied.some((e) => e.type === 'allow');
  const next = playing && !done ? run.events[cursor + 1] : null;

  useEffect(() => {
    if (!playing || following) return;
    if (done) { setPlaying(false); return; }
    setTyping(true);
    const typingTimer = setTimeout(() => setTyping(false), 850 / speed);
    const timer = setTimeout(() => { setMotion(true); moveTo(cursor + 1); }, 1500 / speed);
    return () => { clearTimeout(typingTimer); clearTimeout(timer); };
  }, [playing, following, done, cursor, speed]);
  useEffect(() => { if (reduced) setPlaying(false); }, [reduced]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced || !motion ? 'instant' : 'smooth' });
  }, [cursor, typing, following, reduced]);

  const seek = (to: number, animate = false) => {
    setPlaying(false); setMotion(animate); select(null); controller?.live?.pause();
    moveTo(Math.max(-1, Math.min(run.events.length - 1, to)));
  };
  const toggle = () => {
    select(null);
    if (following) { controller?.live?.pause(); setPlaying(false); return; }
    if (done) { setMotion(false); moveTo(-1); setPlaying(true); }
    else setPlaying((p) => !p);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { select(null); trigger.current?.focus(); return; }
      if ((e.target as HTMLElement)?.closest('button,input,select,textarea,[contenteditable],.react-flow')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(cursor + 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(cursor - 1); }
      else if (e.key === 'Home') { e.preventDefault(); seek(-1); }
      else if (e.key === 'End') { e.preventDefault(); seek(run.events.length - 1); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  return <div className="replay-shell">
    <div ref={graph.workspace} className={`replay-workspace${graph.present ? ' has-network' : ''}`}>
      {graph.present && <AgentNetwork run={run} replay={replay} reduced={reduced} animate={motion || following} speed={speed} selection={selection} onSelect={(node, element) => { trigger.current = element; setPlaying(false); controller?.live?.pause(); select(node); }} />}
      <section ref={graph.chat} className="chat" aria-label={run.condition === 'planted' ? 'Without Chaser' : run.condition === 'monitored' ? 'With Chaser' : 'Agent conversation'}>
        <header className="chat-head"><span className="chat-channel"><Hash size={16} aria-hidden="true" />shirt-launch</span><div className="replay-actions">{headerActions}<button type="button" className="chip-btn" aria-pressed={visible} onClick={() => setVisible(!visible)}><Network size={15} />{visible ? 'Hide graph' : 'Show graph'}</button></div></header>
        <div className="chat-body" ref={scroller} data-motion={!reduced && (motion || following)}>
          <ol className="chat-log" role="log" aria-live="polite" aria-relevant="additions">{replay.applied.map((e) => <ChatMessage key={e.id} e={e} run={run} />)}</ol>
          {next && typing && <p className="chat-typing"><Avatar run={run} actorId={next.actor} size={22} /><span className="dots" aria-hidden="true"><i /><i /><i /></span>{actorName(run, next.actor)} is typing</p>}
          {following && <p className="chat-typing"><span className="dots" aria-hidden="true"><i /><i /><i /></span>Waiting for the next message</p>}
          {controller?.live?.lost && <p className="notice" role="alert">Connection lost. Received messages are kept; reconnecting…</p>}
          {finished && (leak || block) && <div className={`chat-end chat-end--${leak ? 'bad' : 'good'}`}>
            {leak ? <TriangleAlert size={24} /> : <ShieldCheck size={24} />}<div><strong>{leak ? 'Customer list leaked' : 'Attack stopped'}</strong><span>{leak ? 'Nobody noticed. The agents carried on.' : allowed ? 'The email never left. Safe work still went through.' : 'The harmful action was intercepted.'}</span></div>
            {onVersion && <button type="button" onClick={() => onVersion(leak ? 'monitored' : 'planted')}>Replay {leak ? 'with' : 'without'} Chaser</button>}
          </div>}
        </div>
        <footer className="chat-foot"><div className="replay-playback"><button type="button" className="chat-play" onClick={toggle}>{following || playing && !done ? <Pause size={15} /> : done ? <RotateCcw size={15} /> : <Play size={15} />}{following ? 'Pause live' : playing && !done ? 'Pause' : done ? 'Play again' : 'Play'}</button><button type="button" className="pager-btn" aria-label="Previous step" disabled={cursor < 0} onClick={() => seek(cursor - 1)}><ChevronLeft size={16} /></button><button type="button" className="pager-btn" aria-label="Next step" disabled={done} onClick={() => seek(cursor + 1, true)}><ChevronRight size={16} /></button></div><span className="chat-count">{cursor + 1} / {run.events.length}</span></footer>
      </section>
    </div>
    <div className="replay-seek"><label><span className="sr-only">Replay position</span><input type="range" min={-1} max={Math.max(-1, run.events.length - 1)} value={cursor} aria-valuetext={replay.current?.summary ?? 'Before the first step'} onChange={(e) => seek(Number(e.target.value))} /></label><label><span className="sr-only">Playback speed</span><select className="chip-btn" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={.5}>½×</option><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>{controller?.live && !following && !controller.live.ended && <button type="button" className="text-btn" onClick={() => { setPlaying(false); setMotion(false); controller.live!.follow(); }}>Follow latest</button>}</div>
    {(selection || detail) && <aside className="replay-detail glass" aria-label={detail ? 'Selected details' : controller ? 'Inspector' : 'Step inspector'}><header><strong>Selected details</strong><button type="button" className="text-btn" aria-label="Follow current step" onClick={() => { select(null); trigger.current?.focus(); }}>Close</button></header>{detail ?? (selection && <NodeDetails selection={selection} run={run} events={replay.applied} onSeek={seek} />)}</aside>}
    <p className="sr-only" role="status">{replay.current?.summary ?? 'Before the first step'}</p>
  </div>;
}
function NodeDetails({ selection, run, events, onSeek }: { selection: NetworkSelection; run: Run; events: ReplayEvent[]; onSeek: (step: number) => void }) {
  const actor = selection.kind === 'actor' ? run.actors.find((a) => a.id === selection.id) : null;
  const record = selection.kind === 'record' ? run.records.find((r) => r.id === selection.id) : null;
  const related = events.filter((e) => (selection.kind === 'actor' && e.actor === selection.id) || (e.target?.kind === selection.kind && e.target.id === selection.id));
  const touched = related.length > 0;
  return <div className="network-node-detail"><h3>{actor?.name ?? record?.label}</h3>
    <p>{actor?.role ?? (record?.planted ? 'This file was planted as part of the scenario.' : 'A record in the agent environment.')}</p>
    {record?.content && (touched ? <blockquote className="record-well">{record.content}</blockquote> : <p className="network-wait">This record has not been read or checked at this step.</p>)}
    <h4>Events through this step</h4>{related.length ? <ol>{related.map((e) => <li key={e.id}><button type="button" onClick={() => onSeek(e.seq)}><span>{String(e.seq + 1).padStart(2, '0')}</span>{e.summary}</button></li>)}</ol> : <p className="network-wait">No activity yet.</p>}
  </div>;
}
