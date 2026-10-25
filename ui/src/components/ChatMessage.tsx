import { Ban, Check, FileText } from 'lucide-react';
import type { ReplayEvent, Run } from '../model/types.ts';
import { actorName } from '../lib/words.ts';
import { Avatar } from './Avatar.tsx';

/**
 * One step of a run as a group-chat message: notes arrive as attachments, tool calls as cards, and
 * Chaser's checks and blocks as its own posts. With onSelect it is a button that opens the step's detail.
 */
export function ChatMessage({ e, run, onSelect, selected = false }: { e: ReplayEvent; run: Run; onSelect?: () => void; selected?: boolean }) {
  const actor = run.actors.find((a) => a.id === e.actor);
  const isVeto = actor?.kind === 'monitor';
  const name = actorName(run, e.actor);
  const record = e.target?.kind === 'record' ? run.records.find((r) => r.id === e.target!.id) : null;
  const to = e.target?.kind === 'actor' ? actorName(run, e.target.id) : null;
  const text = e.text?.split('\n').join(' ') ?? e.summary;

  const content = (
    <>
      <Avatar run={run} actorId={e.actor} />
      <div className="msg-main">
        <span className="msg-name">{name}</span>
        <Body e={e} text={text} to={to} record={record} />
      </div>
    </>
  );
  return (
    <li className={`msg ${isVeto ? 'msg--veto' : ''} ${selected ? 'is-selected' : ''}`}>
      {onSelect ? (
        <button type="button" className="msg-btn" onClick={onSelect} aria-pressed={selected}>
          {content}
        </button>
      ) : (
        content
      )}
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
        {text} <span className="pending">waiting for Chaser</span>
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
