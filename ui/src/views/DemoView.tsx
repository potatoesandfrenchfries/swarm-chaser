import { useState } from 'react';
import type { Bundle } from '../model/types.ts';
import { NetworkReplay } from '../components/NetworkReplay.tsx';

type Version = 'planted' | 'monitored';

/** The original chat-first demo; the graph is an optional companion, never a replacement. */
export function DemoView({ bundle }: { bundle: Bundle }) {
  const [version, setVersion] = useState<Version>('planted');
  const [graphVisible, setGraphVisible] = useState(false);
  const run = bundle.runs.find((r) => r.condition === version);
  return <main className="story">
    <h1 className="story-title">{bundle.description}</h1>
    {run ? <NetworkReplay key={`${bundle.id}:${run.id}`} run={run} onVersion={setVersion} graphVisible={graphVisible} onGraphVisibleChange={setGraphVisible} headerActions={<div className="runs" role="radiogroup" aria-label="Version">
      <button type="button" role="radio" aria-checked={version === 'planted'} onClick={() => setVersion('planted')}>Without VETO</button>
      <button type="button" role="radio" aria-checked={version === 'monitored'} onClick={() => setVersion('monitored')}>With VETO</button>
    </div>} /> : <p className="notice">This example has no run to play.</p>}
  </main>;
}
