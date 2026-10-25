import type { ReactNode } from 'react';
import { claimMetrics } from '../model/metrics.ts';
import { carriesClaim, downstreamOf, type ReplayState } from '../model/replay.ts';
import type { Bundle, EvidenceQuote, ReplayEvent, Run } from '../model/types.ts';
import { BASIS_WORD, PROVENANCE_NOTE, PROVENANCE_WORD, actorName, nodeName, vendorOf } from '../lib/words.ts';
import { useStore, type Selection } from '../state/store.tsx';
import { EventMark, StatusTag } from './Glyphs.tsx';

/**
 * The verbatim record behind whatever is selected, or behind the current event when nothing is.
 * Serif = text as written in the source. Sans = our description. Mono = ids, files, tool calls.
 */
export function Inspector({ bundle, run, state, className = '' }: { bundle: Bundle; run: Run; state: ReplayState; className?: string }) {
  const { state: app, dispatch } = useStore();
  const sel = app.selection;
  const follow = !sel;
  const goTo = (e: ReplayEvent) => {
    dispatch({ type: 'seek', cursor: e.seq });
    dispatch({ type: 'select', selection: { kind: 'event', id: e.id } });
  };
  const select = (s: Selection) => dispatch({ type: 'select', selection: s });

  let body: ReactNode;
  if (sel?.kind === 'actor') body = <ActorPanel run={run} state={state} id={sel.id} goTo={goTo} />;
  else if (sel?.kind === 'record') body = <RecordPanel run={run} state={state} id={sel.id} goTo={goTo} />;
  else if (sel?.kind === 'claim') body = <ClaimPanel run={run} state={state} id={sel.id} goTo={goTo} />;
  else {
    const ev = sel?.kind === 'event' ? run.events.find((e) => e.id === sel.id) : state.current;
    body = ev ? <EventPanel run={run} state={state} ev={ev} goTo={goTo} select={select} /> : <RunPanel bundle={bundle} run={run} select={select} />;
  }

  return (
    <aside className={`inspector glass ${className}`} aria-label="Inspector">
      <div className="inspector-head">
        <span>{follow ? 'Latest step' : 'Selected'}</span>
        {!follow && (
          <button type="button" className="text-btn" onClick={() => dispatch({ type: 'select', selection: null })}>
            Close
          </button>
        )}
      </div>
      <div className="inspector-body" key={sel ? `${sel.kind}:${sel.id}` : `cur:${state.cursor}`}>
        {body}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="insp-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Source({ file, at }: { file: string; at: string | null }) {
  return (
    <code className="source-ptr">
      {file}
      {at ? ` #${at}` : ''}
    </code>
  );
}

function EventLink({ run, e, onClick, cursor }: { run: Run; e: ReplayEvent; onClick: (e: ReplayEvent) => void; cursor: number }) {
  return (
    <li>
      <button type="button" className={`event-link ${e.seq > cursor ? 'is-future' : ''}`} onClick={() => onClick(e)}>
        <span className="event-link-step">{e.seq + 1}</span>
        <span>{e.summary}</span>
        {e.seq > cursor && <em>later</em>}
      </button>
    </li>
  );
}

/** Record content with each evidence quote marked where it occurs. */
function Highlighted({ content, quotes }: { content: string; quotes: EvidenceQuote[] }) {
  const parts: ReactNode[] = [];
  let rest = content;
  let k = 0;
  const qs = quotes.map((q) => q.quote).filter(Boolean);
  while (rest.length) {
    const hits = qs.map((q) => ({ q, i: rest.indexOf(q) })).filter((h) => h.i >= 0).sort((a, b) => a.i - b.i);
    if (!hits.length) {
      parts.push(rest);
      break;
    }
    const h = hits[0];
    parts.push(rest.slice(0, h.i));
    const stance = quotes.find((q) => q.quote === h.q)?.stance ?? 'context';
    parts.push(
      <mark key={k++} className={`ev-mark ev-mark--${stance}`}>
        {h.q}
      </mark>,
    );
    rest = rest.slice(h.i + h.q.length);
  }
  return <pre className="record-well">{parts}</pre>;
}

function EventPanel({ run, state, ev, goTo, select }: { run: Run; state: ReplayState; ev: ReplayEvent; goTo: (e: ReplayEvent) => void; select: (s: Selection) => void }) {
  const claim = ev.claim ? run.claims.find((c) => c.id === ev.claim) : null;
  const causes = ev.causes.map((id) => run.events.find((e) => e.id === id)!).filter(Boolean);
  const downstream = downstreamOf(run, ev.id);
  const future = ev.seq > state.cursor;
  return (
    <>
      <div className="insp-title">
        <span>Step {ev.seq + 1}</span>
      </div>
      <p className="insp-route">
        <button type="button" className="text-btn" onClick={() => select({ kind: 'actor', id: ev.actor })}>
          {actorName(run, ev.actor)}
        </button>
        {ev.target && (
          <>
            <span aria-hidden="true"> → </span>
            <span className="sr-only"> to </span>
            <button type="button" className="text-btn" onClick={() => ev.target && select({ kind: ev.target.kind, id: ev.target.id })}>
              {nodeName(run, ev.target)}
            </button>
          </>
        )}
      </p>
      {future && <p className="notice">This step comes later in the story. The stage does not show it yet.</p>}
      <p className="insp-summary">{ev.summary}</p>

      {ev.text && (
        <Section title={ev.tool ? 'Tool output' : 'Message'}>
          <blockquote className={`verbatim ${claim && carriesClaim(ev) ? 'has-claim' : ''}`}>{markClaim(ev.text, claim?.text ?? null, carriesClaim(ev) || ev.type === 'read')}</blockquote>
        </Section>
      )}
      {ev.verdict && (
        <Section title="VETO’s verdict">
          <StatusTag status={ev.verdict} />
        </Section>
      )}
      {ev.evidence.length > 0 && (
        <Section title="Evidence">
          {ev.evidence.map((q, i) => {
            const rec = run.records.find((r) => r.id === q.record);
            return (
              <div key={i} className="evidence">
                <button type="button" className="text-btn mono" onClick={() => select({ kind: 'record', id: q.record })}>
                  {rec?.label ?? q.record}
                </button>
                <span className={`stance stance--${q.stance}`}>{q.stance === 'contradicts' ? 'says otherwise' : q.stance === 'supports' ? 'agrees' : 'context'}</span>
                {rec?.content ? <Highlighted content={rec.content} quotes={[q]} /> : <p className="muted">Only the quote is stored: “{q.quote}”</p>}
              </div>
            );
          })}
        </Section>
      )}
      {/* The claim is already marked inside the message; show it apart only when the message does not hold it. */}
      {claim && !ev.text?.includes(claim.text) && (
        <Section title="The claim">
          <button type="button" className="claim-chip" onClick={() => select({ kind: 'claim', id: claim.id })}>
            <mark>{claim.text}</mark>
          </button>
        </Section>
      )}
      {causes.length > 0 && (
        <Section title="Why it happened">
          <ul className="event-list">{causes.map((c) => <EventLink key={c.id} run={run} e={c} onClick={goTo} cursor={state.cursor} />)}</ul>
        </Section>
      )}
      {downstream.length > 0 && (
        <Section title="What it led to">
          <ul className="event-list">{downstream.map((c) => <EventLink key={c.id} run={run} e={c} onClick={goTo} cursor={state.cursor} />)}</ul>
        </Section>
      )}
      <details className="tech">
        <summary>Technical details</summary>
        {ev.tool && (
          <code className="tool-call">
            {ev.tool.name}({Object.entries(ev.tool.args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})
          </code>
        )}
        <Provenance basis={BASIS_WORD[ev.basis]} source={ev.source} order={ev.order_basis} ts={ev.ts} />
      </details>
    </>
  );
}

function Provenance({ basis, source, order, ts }: { basis: string; source: { file: string; ref: string | null } | null; order: string; ts: string | null }) {
  return (
    <section className="insp-section">
      <dl className="facts">
        <dt>Basis</dt>
        <dd>{basis}</dd>
        <dt>Order</dt>
        <dd>{order === 'logged-sequence' ? 'Position in the log' : order === 'timestamp' ? 'Timestamp' : 'Timestamp tie, order uncertain'}</dd>
        <dt>Time</dt>
        <dd>{ts ?? 'Not recorded'}</dd>
        <dt>Source</dt>
        <dd>{source ? <Source file={source.file} at={source.ref} /> : 'No pointer'}</dd>
      </dl>
    </section>
  );
}

/** Wrap the claim's exact text in a highlighter mark where it appears; otherwise leave the text alone. */
function markClaim(text: string, claim: string | null, enabled: boolean): ReactNode {
  if (!claim || !enabled) return text;
  const i = text.indexOf(claim);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{claim}</mark>
      {text.slice(i + claim.length)}
    </>
  );
}

function ClaimPanel({ run, state, id, goTo }: { run: Run; state: ReplayState; id: string; goTo: (e: ReplayEvent) => void }) {
  const claim = run.claims.find((c) => c.id === id);
  if (!claim) return <p className="muted">This claim is not in the current run.</p>;
  const cs = state.claims[id];
  const m = claimMetrics(run, id, state.cursor);
  const related = run.events.filter((e) => e.claim === id || m.correctiveActions.includes(e.id));
  return (
    <>
      <div className="insp-title">
        <EventMark type="claim" size={14} />
        <span>
          The claim <span className="muted">· first said at step {(run.events.find((e) => e.id === claim.origin)?.seq ?? 0) + 1}</span>
        </span>
      </div>
      <blockquote className={`verbatim verbatim--claim ${cs.status === 'contradicted' ? 'is-struck' : ''}`}>
        <mark>{claim.text}</mark>
      </blockquote>
      <div className="claim-status-row">
        <StatusTag status={cs.status} />
        {claim.ground_truth === 'false-by-design' && <span className="truth">False on purpose: it was planted.</span>}
        {claim.ground_truth === 'true-by-design' && <span className="truth">True by design.</span>}
      </div>
      <Section title="So far">
        <dl className="facts">
          <dt>Reached</dt>
          <dd>{m.exposed.map((a) => actorName(run, a)).join(', ') || 'Nobody yet'}</dd>
          <dt>Repeated</dt>
          <dd>{m.repetitions.length}</dd>
          <dt>Acted on</dt>
          <dd>{m.actions.length}</dd>
          <dt>Caught</dt>
          <dd>{m.detectionDistance === null ? 'Not caught yet' : `${m.detectionDistance} steps after it was first said`}</dd>
        </dl>
        <p className="muted small">Reaching an agent does not mean the agent believed it.</p>
      </Section>
      <Section title="Every step about it">
        <ul className="event-list">{related.map((e) => <EventLink key={e.id} run={run} e={e} onClick={goTo} cursor={state.cursor} />)}</ul>
      </Section>
    </>
  );
}

function ActorPanel({ run, state, id, goTo }: { run: Run; state: ReplayState; id: string; goTo: (e: ReplayEvent) => void }) {
  const a = run.actors.find((x) => x.id === id);
  if (!a) return <p className="muted">Not in this version of the story.</p>;
  const st = state.actors[id];
  const mine = run.events.filter((e) => e.actor === id || (e.target?.kind === 'actor' && e.target.id === id));
  return (
    <>
      <div className="insp-title">
        <span className={`mini-node mini-node--${a.kind}`} aria-hidden="true" />
        <span>{a.name}</span>
      </div>
      {a.role && <p className="insp-summary">{a.role}</p>}
      <dl className="facts">
        {a.model && (
          <>
            <dt>Model</dt>
            <dd className="model-cell">
              {vendorOf(a.model) && <img src={`/logos/${vendorOf(a.model)}.svg`} alt="" width="14" height="14" />}
              {a.model}
            </dd>
          </>
        )}
        <dt>So far</dt>
        <dd>
          {[st.said.length && 'said the claim', !st.said.length && st.exposed.length && 'heard the claim', st.acted.length && 'acted on it', st.corrected.length && 'was told it was wrong', st.checked.length && 'checked it']
            .filter(Boolean)
            .join(', ') || 'Has not heard the claim'}
        </dd>
      </dl>
      <Section title={`Every step involving ${a.name}`}>
        <ul className="event-list">{mine.map((e) => <EventLink key={e.id} run={run} e={e} onClick={goTo} cursor={state.cursor} />)}</ul>
      </Section>
    </>
  );
}

function RecordPanel({ run, state, id, goTo }: { run: Run; state: ReplayState; id: string; goTo: (e: ReplayEvent) => void }) {
  const r = run.records.find((x) => x.id === id);
  if (!r) return <p className="muted">This record is not in the current run.</p>;
  const rs = state.records[id];
  const touching = run.events.filter((e) => (e.target?.kind === 'record' && e.target.id === id) || e.evidence.some((q) => q.record === id));
  const quotes = run.events.filter((e) => e.seq <= state.cursor).flatMap((e) => e.evidence.filter((q) => q.record === id));
  return (
    <>
      <div className="insp-title">
        <span className="mini-record" aria-hidden="true" />
        <span className="mono">{r.label}</span>
      </div>
      {r.planted && <p className="notice notice--claim">Planted by the experiment before the run started.</p>}
      <Section title={r.content ? 'Content, verbatim' : 'Content'}>{r.content ? <Highlighted content={r.content} quotes={quotes} /> : <p className="muted">The bundle stores no content for this record, only the changes below.</p>}</Section>
      {rs.state && (
        <Section title="State at this step">
          <p className={`record-now record-now--${rs.lastChange}`}>{rs.state}</p>
        </Section>
      )}
      <Section title="Events touching it">
        <ul className="event-list">{touching.map((e) => <EventLink key={e.id} run={run} e={e} onClick={goTo} cursor={state.cursor} />)}</ul>
      </Section>
      {r.source && (
        <Section title="Source">
          <Source file={r.source.file} at={r.source.ref} />
        </Section>
      )}
    </>
  );
}

function RunPanel({ bundle, run, select }: { bundle: Bundle; run: Run; select: (s: Selection) => void }) {
  return (
    <>
      <div className="insp-title">
        <span>{run.title}</span>
      </div>
      <p className="insp-summary">{bundle.description}</p>
      {run.notes.map((n, i) => (
        <p key={i} className="muted">
          {n}
        </p>
      ))}
      {run.provenance !== 'synthetic' && (
        <Section title="Data">
          <dl className="facts">
            <dt>Kind</dt>
            <dd>
              {PROVENANCE_WORD[run.provenance]}. {PROVENANCE_NOTE[run.provenance]}
            </dd>
            <dt>Source</dt>
            <dd>{bundle.source}</dd>
          </dl>
        </Section>
      )}
      {run.claims.length > 0 && (
        <Section title={run.claims.length === 1 ? 'The claim' : 'Claims'}>
          {run.claims.map((c) => (
            <button key={c.id} type="button" className="claim-chip" onClick={() => select({ kind: 'claim', id: c.id })}>
              <mark>{c.text}</mark>
            </button>
          ))}
        </Section>
      )}
    </>
  );
}
