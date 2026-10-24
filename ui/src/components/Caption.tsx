import type { ReplayState } from '../model/replay.ts';
import type { Run } from '../model/types.ts';
import { STATUS_WORD, stepLabel } from '../lib/words.ts';
import { EventMark, StatusGlyph } from './Glyphs.tsx';

/** One sentence for the current event, with its verbatim words underneath. Also the screen-reader narration. */
export function Caption({ run, state }: { run: Run; state: ReplayState }) {
  const e = state.current;
  const total = run.events.length;
  if (!e) {
    return (
      <div className="caption" aria-live="polite">
        <div className="caption-step">{stepLabel(-1, total)}. Press play, or use the arrow keys.</div>
        <p className="caption-line" key="intro">
          {run.claims.some((c) => c.ground_truth === 'false-by-design')
            ? `Watch a false claim move between ${run.actors.filter((a) => a.kind === 'agent').length} agents, see what they do with it${run.actors.some((a) => a.kind === 'monitor') ? ', and whether the Judge catches it' : ''}.`
            : `Watch how a claim moves between ${run.actors.filter((a) => a.kind === 'agent').length} agents and what they do with it.`}
        </p>
      </div>
    );
  }
  return (
    <div className="caption" aria-live="polite">
      <div className="caption-step">
        <EventMark type={e.type} verdict={e.verdict} size={12} />
        <span>{stepLabel(state.cursor, total)}</span>
      </div>
      <p className="caption-line" key={e.id}>
        {e.summary}
      </p>
      {e.type === 'check' && e.verdict && (
        <p className={`caption-verdict caption-verdict--${e.verdict}`} key={`v-${e.id}`}>
          <StatusGlyph status={e.verdict} size={18} />
          <span>
            <strong>{STATUS_WORD[e.verdict]}</strong>
            {e.evidence[0] ? ` by the ${(run.records.find((r) => r.id === e.evidence[0].record)?.label ?? e.evidence[0].record).toLowerCase()}` : ''}
          </span>
        </p>
      )}
      {e.text && e.type !== 'check' && (
        <p className="caption-quote" key={`q-${e.id}`}>
          <span className="sr-only">Verbatim: </span>“{e.text.split('\n')[0]}”
        </p>
      )}
    </div>
  );
}
