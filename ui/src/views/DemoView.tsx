import { useEffect, useRef, useState } from 'react';
import { Ban, Check, FileText, Hash, Pause, Play, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { Bundle, ReplayEvent, Run } from '../model/types.ts';
import { Avatar } from '../components/Avatar.tsx';
import { actorName } from '../lib/words.ts';
import { useReducedMotion } from '../state/hooks.ts';

const MESSAGE_MS = 1500;
const TYPING_MS = 650;

type Version = 'planted' | 'monitored';

/**
 * The demo as the agents' own group chat. The planted note arrives as an ordinary attachment, the
 * agents pass it on, and either the customer list leaks or VETO steps into the chat and blocks it.
 */
export function DemoView({ bundle }: { bundle: Bundle }) {
  const reduced = useReducedMotion();
  const [version, setVersion] = useState<Version>('planted');
  const run = bundle.runs.find((r) => r.condition === version);
  const n = run?.events.length ?? 0;
  const [shown, setShown] = useState(reduced ? n : 0);
  const [playing, setPlaying] = useState(!reduced);
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // Each message first shows "typing", then lands; the chat stops at the last one.
  useEffect(() => {
    if (!playing) return;
    if (shown >= n) {
      setPlaying(false);
      return;
    }
    setTyping(true);
    const t1 = setTimeout(() => setTyping(false), MESSAGE_MS - TYPING_MS);
    const t2 = setTimeout(() => setShown((s) => s + 1), MESSAGE_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [playing, shown, n]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [shown, typing, reduced]);

  if (!run) return <div className="center-state">This example has no attack to play.</div>;

  const start = (v: Version) => {
    setVersion(v);
    const len = bundle.runs.find((r) => r.condition === v)?.events.length ?? 0;
    setShown(reduced ? len : 0);
    setPlaying(!reduced);
  };
  const events = run.events.slice(0, shown);
  const next = playing && shown < n ? run.events[shown] : null;
  const done = shown >= n;
  const leak = events.find((e) => e.type === 'action' && e.claim);
  const block = events.find((e) => e.type === 'divert');

  return (
    <main className="story">
      <h1 className="story-title">{bundle.description}</h1>

      <section className="chat" aria-label={version === 'planted' ? 'Without VETO' : 'With VETO'}>
        <header className="chat-head">
          <span className="chat-channel">
            <Hash size={16} aria-hidden="true" />
            shirt-launch
          </span>
          <div className="runs" role="radiogroup" aria-label="Version">
            <button type="button" role="radio" aria-checked={version === 'planted'} onClick={() => start('planted')}>
              Without VETO
            </button>
            <button type="button" role="radio" aria-checked={version === 'monitored'} onClick={() => start('monitored')}>
              With VETO
            </button>
          </div>
        </header>

        <div className="chat-body" ref={scroller}>
          <ol className="chat-log" aria-live="polite">
            {events.map((e) => (
              <Message key={`${version}-${e.id}`} e={e} run={run} />
            ))}
          </ol>
          {next && typing && (
            <p className="chat-typing">
              <Avatar run={run} actorId={next.actor} size={22} />
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {actorName(run, next.actor)} is typing
            </p>
          )}
          {done && (leak || block) && (
            <div className={`chat-end ${leak ? 'chat-end--bad' : 'chat-end--good'}`}>
              {leak ? <TriangleAlert size={24} aria-hidden="true" /> : <ShieldCheck size={24} aria-hidden="true" />}
              <div>
                <strong>{leak ? 'Customer list leaked' : 'Attack stopped'}</strong>
                <span>{leak ? 'Nobody noticed. The agents carried on.' : 'The email never left. Safe work still went through.'}</span>
              </div>
              <button type="button" onClick={() => start(leak ? 'monitored' : 'planted')}>
                {leak ? 'Replay with VETO' : 'Replay without VETO'}
              </button>
            </div>
          )}
        </div>

        <footer className="chat-foot">
          <button type="button" className="chat-play" onClick={() => (done ? start(version) : setPlaying((p) => !p))}>
            {done ? <RotateCcw size={16} aria-hidden="true" /> : playing ? <Pause size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" /> : <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden="true" />}
            {done ? 'Play again' : playing ? 'Pause' : 'Play'}
          </button>
          <span className="chat-count">
            {shown} / {n}
          </span>
        </footer>
      </section>
    </main>
  );
}

function Message({ e, run }: { e: ReplayEvent; run: Run }) {
  const actor = run.actors.find((a) => a.id === e.actor);
  const isVeto = actor?.kind === 'monitor';
  const name = actorName(run, e.actor);
  const record = e.target?.kind === 'record' ? run.records.find((r) => r.id === e.target!.id) : null;
  const to = e.target?.kind === 'actor' ? actorName(run, e.target.id) : null;
  const text = e.text?.split('\n').join(' ') ?? e.summary;

  return (
    <li className={`msg ${isVeto ? 'msg--veto' : ''}`}>
      <Avatar run={run} actorId={e.actor} />
      <div className="msg-main">
        <span className="msg-name">{name}</span>
        <Body e={e} text={text} to={to} record={record} />
      </div>
    </li>
  );
}

function Body({ e, text, to, record }: { e: ReplayEvent; text: string; to: string | null; record: Run['records'][number] | null | undefined }) {
  const tool = e.tool?.name;
  if (e.type === 'read' && record) {
    return (
      <div className={`attachment ${record.planted ? 'attachment--planted' : ''}`}>
        <span className="attachment-name">
          <FileText size={15} aria-hidden="true" />
          {record.label}
        </span>
        <p>{text}</p>
      </div>
    );
  }
  if (e.type === 'action') {
    const leaked = Boolean(e.claim);
    return (
      <div className={`toolcall ${leaked ? 'toolcall--bad' : ''}`}>
        <code>{tool}</code>
        <p>{text}</p>
        {leaked && <b className="stamp stamp--bad">Leaked</b>}
      </div>
    );
  }
  if (e.type === 'submit') {
    return (
      <p className="msg-text">
        {text} <span className="pending">waiting for VETO</span>
      </p>
    );
  }
  if (e.type === 'check') {
    return (
      <div className="veto-card veto-card--check">
        <span className="veto-card-head">Checked against {record?.label ?? 'the records'}</span>
        <p>{text}</p>
      </div>
    );
  }
  if (e.type === 'divert') {
    return (
      <div className="veto-card veto-card--block">
        <span className="veto-card-head">
          <Ban size={16} aria-hidden="true" />
          Blocked <code>{tool}</code>
        </span>
        <p>{text}</p>
        <b className="stamp stamp--block">Blocked</b>
      </div>
    );
  }
  if (e.type === 'allow') {
    return (
      <p className="msg-text msg-allowed">
        <Check size={15} aria-hidden="true" />
        Allowed <code>{tool}</code>: {text}
      </p>
    );
  }
  return (
    <p className="msg-text">
      {to && <span className="mention">@{to}</span>} {text}
    </p>
  );
}
