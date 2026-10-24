import type { ReactNode } from 'react';
import { claimMetrics } from '../model/metrics.ts';
import type { ReplayState } from '../model/replay.ts';
import type { Run } from '../model/types.ts';
import { useCountUp } from '../state/hooks.ts';
import { StatusTag } from './Glyphs.tsx';

/**
 * The focus claim and how far it has gone, counted to the playhead. The ring is a real proportion
 * (agents exposed out of agents in the run); the other two are plain counts.
 */
export function ClaimMeter({ run, state, claimId, animate, onOpen, children }: { run: Run; state: ReplayState; claimId: string; animate: boolean; onOpen: () => void; children?: ReactNode }) {
  const claim = run.claims.find((c) => c.id === claimId);
  const m = claimMetrics(run, claimId, state.cursor);
  const agents = run.actors.filter((a) => a.kind === 'agent').length;
  // Counts tick only when the replay steps or plays; a seek shows the settled numbers at once.
  const exposed = useCountUp(m.exposed.length, !animate);
  const acted = useCountUp(m.actions.length, !animate);
  const cs = state.claims[claimId];
  if (!claim) return null;
  const stated = cs?.stated || m.exposed.length > 0;
  const R = 15;
  const C = 2 * Math.PI * R;
  const frac = agents ? m.exposed.length / agents : 0;
  return (
    <section className="meter glass" aria-label={`Claim ${claim.id}, counted up to the current step`}>
      <button type="button" className="meter-claim" onClick={onOpen} aria-label={`Inspect claim ${claim.id}`}>
        <span className="meter-id">{claim.ground_truth === 'false-by-design' ? 'The planted claim (false on purpose)' : 'The claim we are following'}</span>
        <span className={`meter-quote ${stated ? '' : 'is-dormant'} ${cs?.status === 'contradicted' ? 'is-struck' : ''}`}>
          <mark>{claim.text}</mark>
        </span>
      </button>
      <div className="meter-stats">
        <div className="meter-stat">
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r={R} className="meter-ring-track" />
            <circle cx="20" cy="20" r={R} className="meter-ring" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 20 20)" />
            <text x="20" y="24.5" textAnchor="middle" className="meter-ring-num">
              {exposed}
            </text>
          </svg>
          <span>
            reached
            <small>of {agents} agents</small>
          </span>
        </div>
        <div className="meter-stat">
          <b className="meter-square">{acted}</b>
          <span>
            acted on it
            <small>{acted === 1 ? 'action' : 'actions'}</small>
          </span>
        </div>
        <div className="meter-stat">
          <StatusTag status={cs?.status ?? 'unchecked'} />
        </div>
      </div>
      {children}
    </section>
  );
}
