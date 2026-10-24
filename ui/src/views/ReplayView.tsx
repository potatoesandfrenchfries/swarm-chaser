import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Caption } from '../components/Caption.tsx';
import { ClaimMeter } from '../components/ClaimMeter.tsx';
import { Inspector } from '../components/Inspector.tsx';
import { Stage } from '../components/Stage.tsx';
import { Transport } from '../components/Transport.tsx';
import { deriveState } from '../model/replay.ts';
import type { Bundle, Run } from '../model/types.ts';
import { useReducedMotion } from '../state/hooks.ts';
import { useStore } from '../state/store.tsx';
import { useViewport } from './useViewport.ts';

export function focusClaimOf(bundle: Bundle, run: Run): string | null {
  const f = bundle.experiment?.focus_claim;
  if (f && run.claims.some((c) => c.id === f)) return f;
  return run.claims[0]?.id ?? null;
}

export function ReplayView({ bundle, run }: { bundle: Bundle; run: Run }) {
  const { state, dispatch } = useStore();
  const reduced = useReducedMotion();
  const vp = useViewport();
  const rs = useMemo(() => deriveState(run, state.cursor), [run, state.cursor]);
  const focus = focusClaimOf(bundle, run);
  const wide = vp.width >= 1000;
  const short = vp.height < 860;
  // The graph is laid out between the measured claim meter and a fixed caption band above the dock,
  // so no panel or caption ever sits on a node. The band is fixed so nodes do not move per event.
  const mainRef = useRef<HTMLElement>(null);
  const [chrome, setChrome] = useState({ meterBottom: 200, dockTop: vp.height - 170 });
  useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main || !wide) return;
    const meter = main.querySelector('.meter');
    const dock = main.querySelector('.dock');
    const measure = () =>
      setChrome((c) => {
        const next = { meterBottom: meter?.getBoundingClientRect().bottom ?? c.meterBottom, dockTop: dock?.getBoundingClientRect().top ?? c.dockTop };
        return Math.abs(next.meterBottom - c.meterBottom) < 1 && Math.abs(next.dockTop - c.dockTop) < 1 ? c : next;
      });
    const ro = new ResizeObserver(measure);
    if (meter) ro.observe(meter);
    if (dock) ro.observe(dock);
    measure();
    return () => ro.disconnect();
  }, [wide, vp.width, vp.height, run.id]);
  const captionBand = short ? 112 : 150;
  const insets = wide
    ? { top: chrome.meterBottom + 12, right: Math.min(420, vp.width * 0.3) + 56, bottom: vp.height - chrome.dockTop + captionBand + 8, left: 40 }
    : { top: 24, right: 8, bottom: 24, left: 8 };

  return (
    <main ref={mainRef} className={`replay ${wide ? 'replay--wide' : 'replay--narrow'} ${short ? 'replay--short' : ''}`} style={wide ? { ['--caption-bottom' as string]: `${vp.height - chrome.dockTop + 14}px`, ['--caption-band' as string]: `${captionBand}px` } : undefined}>
      <div className="replay-stage">
        <Stage
          run={run}
          state={rs}
          transition={state.transition}
          selection={state.selection}
          onSelect={(s) => dispatch({ type: 'select', selection: s })}
          insets={insets}
          reduced={reduced}
          speed={state.speed}
          focusClaim={focus}
          compact={vp.width < 600}
        />
      </div>
      {focus && (
        <ClaimMeter run={run} state={rs} claimId={focus} animate={state.transition.animate && !reduced} onOpen={() => dispatch({ type: 'select', selection: { kind: 'claim', id: focus } })}>
          <Legend />
        </ClaimMeter>
      )}
      <Caption run={run} state={rs} />
      <Transport run={run} focusClaim={focus} />
      <Inspector bundle={bundle} run={run} state={rs} />
    </main>
  );
}

/** The key, in the words a first-time viewer needs, sitting under the counts it explains. */
function Legend() {
  return (
    <ul className="legend" aria-label="Key">
      <li>
        <svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--claim)" strokeWidth="1.8" strokeDasharray="3 3" /></svg>reached
      </li>
      <li>
        <svg width="18" height="18" aria-hidden="true"><circle cx="9" cy="9" r="6.5" fill="none" stroke="var(--claim)" strokeWidth="2.2" /></svg>repeated it
      </li>
      <li>
        <svg width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="var(--claim)" /></svg>acted on it
      </li>
      <li>
        <svg width="22" height="14" aria-hidden="true"><path d="M2 11Q11 1 20 8" fill="none" stroke="var(--claim)" strokeWidth="3" strokeLinecap="round" /></svg>claim moving
      </li>
      <li>
        <svg width="22" height="14" aria-hidden="true"><path d="M2 7H20" stroke="var(--ink)" strokeWidth="1.6" strokeDasharray="1 4" strokeLinecap="round" /></svg>Judge’s check
      </li>
      <li>
        <svg width="22" height="14" aria-hidden="true"><path d="M2 11Q11 1 20 8" fill="none" stroke="var(--correction)" strokeWidth="2.4" /></svg>correction
      </li>
      <li className="legend-note">Reached is not the same as believed.</li>
    </ul>
  );
}
