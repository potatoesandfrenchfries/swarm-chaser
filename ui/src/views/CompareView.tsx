import { useMemo, useState } from 'react';
import { StatusTag } from '../components/Glyphs.tsx';
import { Stage } from '../components/Stage.tsx';
import { claimMetrics, type ClaimMetrics } from '../model/metrics.ts';
import { deriveState } from '../model/replay.ts';
import type { Bundle, Run } from '../model/types.ts';
import { PROVENANCE_WORD } from '../lib/words.ts';
import { useReducedMotion } from '../state/hooks.ts';
import { useStore } from '../state/store.tsx';

type Align = 'end' | 'step';

/** Definitions shown beside each row. Same wording as metrics.ts and ARCHITECTURE.md. */
const DEFS = {
  exposed: 'Agents (not the Judge) who heard the claim in a message or task, or read the note holding it.',
  repetitions: 'Events that pass the claim on after it was first said: repeats, endorsements, tasks carrying it.',
  actions: 'Actions taken on the claim, not counting actions that follow a correction.',
  detection: 'Steps between the claim first being said and the Judge’s check showing it is wrong.',
  corrections: 'Times the Judge stepped in plus corrections, and the actions that followed them.',
};

export function CompareView({ bundle }: { bundle: Bundle }) {
  const { state, dispatch } = useStore();
  const reduced = useReducedMotion();
  const [align, setAlign] = useState<Align>('end');
  const runs = bundle.runs;
  const focus = bundle.experiment?.focus_claim ?? runs.flatMap((r) => r.claims)[0]?.id ?? null;
  const conditionOrder = { baseline: 0, planted: 1, monitored: 2 } as Record<string, number>;
  const ordered = [...runs].sort((a, b) => (conditionOrder[a.condition ?? ''] ?? 9) - (conditionOrder[b.condition ?? ''] ?? 9));
  const cursorFor = (r: Run) => (align === 'end' ? r.events.length - 1 : Math.min(state.cursor, r.events.length - 1));
  const claimText = runs.flatMap((r) => r.claims).find((c) => c.id === focus)?.text;

  const open = (r: Run, cursor: number) => {
    dispatch({ type: 'run', runId: r.id, cursor });
    dispatch({ type: 'view', view: 'replay' });
  };

  return (
    <main className="compare">
      <header className="compare-head">
        <div>
          <p className="compare-kicker">
            <span className={`provenance provenance--${bundle.provenance}`}>
              <i aria-hidden="true" />
              {PROVENANCE_WORD[bundle.provenance]}
            </span>
            <span className="muted">
              {bundle.experiment ? `${runs.length} versions, one run each` : `${runs.length} runs`}
            </span>
          </p>
          <h1>{bundle.experiment?.question ?? `${bundle.title}: every run side by side`}</h1>
          {claimText && (
            <p className="compare-claim">
              Following the claim <mark>{claimText}</mark>
            </p>
          )}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Line the runs up at">
          <button type="button" role="radio" aria-checked={align === 'end'} onClick={() => setAlign('end')}>
            At the end
          </button>
          <button type="button" role="radio" aria-checked={align === 'step'} onClick={() => setAlign('step')}>
            At step {state.cursor + 1}
          </button>
        </div>
      </header>
      {align === 'step' && <p className="compare-note">Each version is shown after its own step {state.cursor + 1}. Step numbers count each version's own steps, so they are not the same moment across versions.</p>}

      <div className="compare-grid" style={{ ['--cols' as string]: ordered.length }}>
        {ordered.map((r) => (
          <RunColumn key={r.id} run={r} cursor={cursorFor(r)} focus={focus} reduced={reduced} onOpen={(c) => open(r, c)} />
        ))}
      </div>

      <section className="compare-story glass">
        <h2>What changed</h2>
        <ol>
          {ordered.map((r) => (
            <li key={r.id}>
              <strong>{r.title}.</strong> {sentence(r, focus ? claimMetrics(r, focus, cursorFor(r)) : null)}
            </li>
          ))}
        </ol>
        {bundle.experiment && (
          <ul className="caveats">
            {bundle.experiment.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function RunColumn({ run, cursor, focus, reduced, onOpen }: { run: Run; cursor: number; focus: string | null; reduced: boolean; onOpen: (cursor: number) => void }) {
  const rs = useMemo(() => deriveState(run, cursor), [run, cursor]);
  const m = focus ? claimMetrics(run, focus, cursor) : null;
  const agents = run.actors.filter((a) => a.kind === 'agent').length;
  const status = focus && rs.claims[focus] ? rs.claims[focus].status : null;
  const goTo = (eventId: string | undefined) => {
    const e = run.events.find((x) => x.id === eventId);
    if (e) onOpen(e.seq);
  };
  return (
    <article className={`run-col glass run-col--${run.condition ?? 'run'}`} aria-label={run.title}>
      <header>
        <h2>{run.title}</h2>
        <p>{run.notes[0]}</p>
      </header>
      <div className="run-stage">
        <Stage run={run} state={rs} transition={{ nonce: 0, animate: false }} selection={null} onSelect={() => onOpen(cursor)} compact animated={false} reduced={reduced} focusClaim={focus} insets={{ top: 14, right: 14, bottom: 14, left: 14 }} />
      </div>
      <dl className="metrics">
        {m && !m.present ? (
          <>
            <dt title={DEFS.exposed}>Agents reached</dt>
            <dd>
              <b className="metric-plain">0</b> of {agents}
            </dd>
            <dt title={DEFS.repetitions}>Times repeated</dt>
            <dd><b className="metric-plain">0</b></dd>
            <dt title={DEFS.actions}>Actions taken on it</dt>
            <dd><b className="metric-plain">0</b></dd>
            <dt>Judge’s verdict</dt>
            <dd className="muted">No false claim</dd>
            <dt title={DEFS.detection}>Caught after</dt>
            <dd className="muted">Nothing to catch</dd>
            <dt title={DEFS.corrections}>Judge stepped in or corrected</dt>
            <dd><b className="metric-plain">0</b></dd>
          </>
        ) : m ? (
          <>
            <dt title={DEFS.exposed}>Agents reached</dt>
            <dd>
              <button type="button" className="metric-btn" onClick={() => goTo(run.claims.find((c) => c.id === focus)?.origin)}>
                <b>{m.exposed.length}</b> of {agents}
              </button>
            </dd>
            <dt title={DEFS.repetitions}>Times repeated</dt>
            <dd>
              <button type="button" className="metric-btn" onClick={() => goTo(m.repetitions[0])} disabled={!m.repetitions.length}>
                <b>{m.repetitions.length}</b>
              </button>
            </dd>
            <dt title={DEFS.actions}>Actions taken on it</dt>
            <dd>
              <button type="button" className="metric-btn" onClick={() => goTo(m.actions[0])} disabled={!m.actions.length}>
                <b>{m.actions.length}</b>
              </button>
            </dd>
            <dt>Judge’s verdict</dt>
            <dd>{status && <StatusTag status={status} />}</dd>
            <dt title={DEFS.detection}>Caught after</dt>
            <dd>
              {m.detectionDistance === null ? (
                <span className="muted">Never (no Judge)</span>
              ) : (
                <button type="button" className="metric-btn" onClick={() => goTo(m.checks.find((c) => c.verdict === 'contradicted')?.event)}>
                  <b>{m.detectionDistance}</b> steps
                </button>
              )}
            </dd>
            <dt title={DEFS.corrections}>Judge stepped in or corrected</dt>
            <dd>
              <button type="button" className="metric-btn" onClick={() => goTo(m.interventions[0] ?? m.corrections[0])} disabled={!m.interventions.length && !m.corrections.length}>
                <b>{m.interventions.length + m.corrections.length}</b>
                {m.correctiveActions.length > 0 && <span className="muted">, {m.correctiveActions.length} fixes</span>}
              </button>
            </dd>
          </>
        ) : null}
      </dl>
      {m && Object.keys(m.finalStates).length > 0 && (
        <div className="final-states">
          <h3>How it ended</h3>
          {Object.entries(m.finalStates).map(([rec, st]) => (
            <p key={rec}>
              <span className="final-label">{run.records.find((r) => r.id === rec)?.label ?? rec}</span>
              <span>{st}</span>
            </p>
          ))}
        </div>
      )}
      <button type="button" className="btn btn--ghost run-open" onClick={() => onOpen(cursor === run.events.length - 1 ? -1 : cursor)}>
        Watch this version
      </button>
    </article>
  );
}

/** A plain description of one run, built only from its metrics and final states. */
function sentence(run: Run, m: ClaimMetrics | null): string {
  const ends = m
    ? Object.entries(m.finalStates)
        .map(([id, st]) => `the ${(run.records.find((r) => r.id === id)?.label ?? id).toLowerCase()} ends at “${st}”`)
        .join('; ')
    : '';
  if (!m) return cap(ends);
  if (!m.present) return `There is no false claim.${ends ? ` ${cap(ends)}.` : ''}`;
  const agents = run.actors.filter((a) => a.kind === 'agent').length;
  const parts = [`The false claim reaches ${m.exposed.length} of ${agents} agents and is acted on ${m.actions.length} ${m.actions.length === 1 ? 'time' : 'times'}`];
  if (m.detectionDistance !== null) parts.push(`the Judge catches it ${m.detectionDistance} steps after it was first said`);
  else parts.push('nobody checks it');
  if (m.corrections.length) parts.push(`then ${m.correctiveActions.length} ${m.correctiveActions.length === 1 ? 'thing is' : 'things are'} fixed`);
  return `${parts.join('; ')}.${ends ? ` ${cap(ends)}.` : ''}`;
}

function cap(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
