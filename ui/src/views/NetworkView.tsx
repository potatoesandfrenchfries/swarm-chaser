import { lazy, Suspense, useMemo, useState } from 'react';
import { Inspector } from '../components/Inspector.tsx';
import { deriveState } from '../model/replay.ts';
import { NetworkReplay } from '../components/NetworkReplay.tsx';
import { focusClaimOf } from '../model/metrics.ts';
import type { Bundle, Run } from '../model/types.ts';
import { useStore } from '../state/store.tsx';

const ExplorerView = lazy(() => import('./ExplorerView.tsx'));

/** The dashboard's default Graph is the same workspace as the demo; the property explorer is optional. */
export function NetworkView({ bundle, run }: { bundle: Bundle; run: Run }) {
  const { state, dispatch } = useStore();
  const [data, setData] = useState(false);
  const live = state.live;
  const replay = useMemo(() => deriveState(run, state.cursor), [run, state.cursor]);
  const detail = state.selection ? <Inspector bundle={bundle} run={run} state={replay} /> : undefined;
  return <div className="dashboard-network">
    <div className="network-view-head"><p className="small muted">Run network <span>· sandbox left / honeypot right</span></p>
      <div className="runs" role="group" aria-label="Graph representation"><button type="button" aria-pressed={!data} onClick={() => setData(false)}>Agent network</button><button type="button" aria-pressed={data} onClick={() => setData(true)}>Data explorer</button></div>
    </div>
    {data ? <Suspense fallback={<p>Preparing the data explorer…</p>}><ExplorerView bundle={bundle} run={run} /></Suspense> : <NetworkReplay key={`${bundle.id}:${run.id}`} run={run} claimId={focusClaimOf(bundle)} detail={detail} controller={{
      cursor: state.cursor,
      selection: state.selection?.kind === 'actor' || state.selection?.kind === 'record' ? { kind: state.selection.kind, id: state.selection.id } : null,
      seek: (cursor) => dispatch({ type: 'seek', cursor }),
      select: (selection) => dispatch({ type: 'select', selection }),
      live: live ? {
        active: live.status !== 'ended' && live.status !== 'lost', ended: live.status === 'ended', following: live.follow, lost: live.status === 'lost',
        follow: () => dispatch({ type: 'live-follow' }), pause: () => dispatch({ type: 'live-pause' }),
      } : undefined,
    }} />}
  </div>;
}
