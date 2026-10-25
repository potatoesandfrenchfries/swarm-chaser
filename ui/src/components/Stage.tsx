import { useMemo } from 'react';
import { Box as LucideBox, FlaskConical, Scale } from 'lucide-react';
import { HUB_SEAT, curveBetween, layoutRun, pointOn, recordWidth, type Box, type Curve, type Placed } from '../lib/layout.ts';
import { EVENT_WORD, monogram, vendorOf } from '../lib/words.ts';
import { channelOf, deriveState, type ActorState, type Channel, type EdgeState, type ReplayState } from '../model/replay.ts';
import type { Run } from '../model/types.ts';
import type { Selection } from '../state/store.tsx';
import { TRAVEL_MS, easeTravel, useElementSize, useTween } from '../state/hooks.ts';
import { StatusGlyph } from './Glyphs.tsx';

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface StageProps {
  run: Run;
  state: ReplayState;
  transition: { nonce: number; animate: boolean; kind?: 'step' | 'play' };
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  /** Space the floating panels cover; the graph is laid out inside what is left. */
  insets?: Insets;
  compact?: boolean;
  reduced: boolean;
  speed?: number;
  /** Highlights the focus claim's carriers; other claims render neutral. */
  focusClaim?: string | null;
  /** False for static thumbnails (compare view); phones use compact sizes but keep the motion. */
  animated?: boolean;
}

const ARRIVAL = 0.82;

const MARKER: Record<Channel, string | undefined> = {
  claim: 'url(#arrow-claim)',
  'claim-action': 'url(#arrow-claim)',
  correct: 'url(#arrow-blue)',
  intervene: 'url(#arrow-blue)',
  'corrective-action': 'url(#arrow-blue)',
  dispute: 'url(#arrow-blue)',
  check: undefined,
  submit: 'url(#arrow-ink)',
  allow: 'url(#arrow-green)',
  divert: 'url(#arrow-red)',
  read: 'url(#arrow-faint)',
  task: 'url(#arrow-faint)',
  action: 'url(#arrow-faint)',
};
const DASHED = new Set<Channel>(['check', 'intervene', 'dispute']);

const PULSE_COLOR: Partial<Record<Channel, string>> = {
  claim: 'var(--claim)',
  'claim-action': 'var(--claim)',
  intervene: 'var(--correction)',
  correct: 'var(--correction)',
  dispute: 'var(--correction)',
  'corrective-action': 'var(--correction)',
  allow: 'var(--supported)',
  divert: 'var(--contradicted)',
};

export function Stage({ run, state, transition, selection, onSelect, insets, compact = false, reduced, speed = 1, focusClaim = null, animated = true }: StageProps) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const box: Box = useMemo(() => {
    const i = insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    return { left: i.left, top: i.top, width: Math.max(120, size.width - i.left - i.right), height: Math.max(120, size.height - i.top - i.bottom) };
  }, [size.width, size.height, insets?.top, insets?.right, insets?.bottom, insets?.left]);
  const placed = useMemo(() => layoutRun(run, box, compact, focusClaim), [run, box, compact, focusClaim]);
  const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const byId = useMemo(() => new Map(run.events.map((e) => [e.id, e])), [run]);

  const current = state.current;
  const animate = transition.animate && !reduced && animated;
  // Playback explains, so it travels at full length; a step the user pressed answers faster.
  const travel = transition.kind === 'play' ? TRAVEL_MS / speed : Math.min(600, TRAVEL_MS / speed);
  const p = useTween(`${transition.nonce}`, travel, animate && Boolean(current?.target));
  const arrived = !animate || !current?.target || p >= ARRIVAL;
  // Until the pulse lands, the world still looks like the step before.
  const prev = useMemo(() => deriveState(run, state.cursor - 1), [run, state.cursor]);
  const shown = arrived ? state : prev;

  const currentCurve: (Curve & { channel: Channel }) | null = useMemo(() => {
    if (!current?.target) return null;
    // Reads travel from what is read to the reader, like every other line.
    const [fromId, toId] = current.type === 'read' ? [current.target.id, current.actor] : [current.actor, current.target.id];
    const a = placed.get(fromId);
    const b = placed.get(toId);
    if (!a || !b) return null;
    const channel = channelOf(current, byId);
    return { ...curveBetween(a, b, channel, center), channel };
  }, [current, placed, byId, center.x, center.y]);

  const ep = easeTravel(p);
  const edges = shown.edges.filter((e) => placed.has(e.from.id) && placed.has(e.to.id));
  const verdictNow = current?.type === 'check' ? current.verdict : null;

  return (
    <div
      ref={ref}
      className={`stage ${compact ? 'stage--compact' : ''}`}
      data-animate={animate ? 'true' : 'false'}
      style={{ ['--record-w' as string]: `${recordWidth(box) - 6}px` }}
    >
      {size.width > 0 && (
        <svg className="stage-svg" width={size.width} height={size.height} aria-hidden="true">
          <defs>
            {(['claim', 'ink', 'faint', 'blue', 'green', 'red'] as const).map((c) => (
              <marker key={c} id={`arrow-${c}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="13" markerHeight="13" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                <path d="M1 1L8 5L1 9" fill="none" stroke={c === 'claim' ? 'var(--claim)' : c === 'blue' ? 'var(--correction)' : c === 'ink' ? 'var(--ink)' : c === 'green' ? 'var(--supported)' : c === 'red' ? 'var(--contradicted)' : 'var(--ink-faint)'} strokeWidth={c === 'claim' ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            ))}
          </defs>

          <g className="edges">
            {edges.map((e) => {
              const isCurrentNew = animate && !arrived && current && e.events.length === 1 && e.events[0] === current.id;
              if (isCurrentNew) return null;
              const cv = curveBetween(placed.get(e.from.id)!, placed.get(e.to.id)!, e.channel, center);
              return <EdgePath key={e.key} edge={e} curve={cv} age={state.cursor - e.lastSeq} focusClaim={focusClaim} run={run} />;
            })}
          </g>

          {currentCurve && animate && p < 1 && (
            <g className="pulse">
              <path
                d={currentCurve.d}
                className={`edge edge--${currentCurve.channel} edge--drawing`}
                // Solid channels draw on behind the pulse; dashed ones keep their pattern and fade in.
                style={
                  DASHED.has(currentCurve.channel)
                    ? { opacity: Math.min(1, ep * 1.6) }
                    : { strokeDasharray: currentCurve.length, strokeDashoffset: currentCurve.length * (1 - ep) }
                }
              />
              {p < ARRIVAL + 0.08 && <PulseHead curve={currentCurve} t={ep} color={PULSE_COLOR[currentCurve.channel] ?? 'var(--ink)'} />}
            </g>
          )}

          <g className="rings">
            {run.actors.map((a) => {
              const pl = placed.get(a.id);
              if (!pl) return null;
              return <ActorRings key={a.id} at={pl} st={shown.actors[a.id]} compact={compact} focusClaim={focusClaim} />;
            })}
          </g>

          {arrived && currentCurve && animate && (
            <circle key={`ripple-${transition.nonce}`} className="arrival-ripple" cx={currentCurve.p1.x} cy={currentCurve.p1.y} r={compact ? 14 : 26} style={{ ['--ripple' as string]: PULSE_COLOR[currentCurve.channel] ?? 'var(--ink)' }} />
          )}
        </svg>
      )}

      {size.width > 0 && (
        <div className="stage-nodes">
          {run.actors.map((a) => {
            const pl = placed.get(a.id);
            if (!pl) return null;
            const st = shown.actors[a.id];
            const isCurrent = current && (current.actor === a.id || (current.target?.kind === 'actor' && current.target.id === a.id));
            const words = actorWords(st, current?.actor === a.id && current?.type === 'check' && arrived);
            return (
              <button
                key={a.id}
                type="button"
                className={`node node--${a.kind} ${isCurrent ? 'is-current' : ''} ${selection?.kind === 'actor' && selection.id === a.id ? 'is-selected' : ''}`}
                style={{ left: pl.x, top: pl.y }}
                onClick={() => onSelect({ kind: 'actor', id: a.id })}
                aria-pressed={selection?.kind === 'actor' && selection.id === a.id}
                aria-label={`${a.name}. ${words || 'Not involved with the claim yet.'}`}
              >
                <span className="node-disc">
                  {a.kind === 'monitor' ? <JudgeIcon /> : monogram(a.name)}
                  {vendorOf(a.model) && <img className="node-vendor" src={`/logos/${vendorOf(a.model)}.svg`} alt="" />}
                </span>
                {!compact && (
                  <span className="node-label">
                    {a.name}
                    {words && <small>{words}</small>}
                  </span>
                )}
              </button>
            );
          })}
          {placed.get(HUB_SEAT) && (
            <div className="hub-seat" style={{ left: placed.get(HUB_SEAT)!.x, top: placed.get(HUB_SEAT)!.y }} aria-label="No Judge in this version">
              <span>No Judge</span>
            </div>
          )}
          {currentCurve && current && (
            <span
              key={`label-${transition.nonce}`}
              className={`edge-label edge-label--${currentCurve.channel}`}
              style={{ left: pointOn(currentCurve, 0.5).x, top: pointOn(currentCurve, 0.5).y }}
              aria-hidden="true"
            >
              {EVENT_WORD[current.type]}
            </span>
          )}
          {run.records.map((rec) => {
            const pl = placed.get(rec.id);
            if (!pl) return null;
            const rs = shown.records[rec.id];
            if (rec.kind === 'sandbox' || rec.kind === 'honeypot') {
              const isCurrent = current?.target?.kind === 'record' && current.target.id === rec.id;
              const latest = rs.effects.slice(-2);
              return (
                <button
                  key={rec.id}
                  type="button"
                  className={`gate gate--${rec.kind} ${rs.effects.length ? 'is-filled' : ''} ${isCurrent ? 'is-current' : ''} ${selection?.kind === 'record' && selection.id === rec.id ? 'is-selected' : ''}`}
                  style={{ left: pl.x, top: pl.y }}
                  onClick={() => onSelect({ kind: 'record', id: rec.id })}
                  aria-pressed={selection?.kind === 'record' && selection.id === rec.id}
                  aria-label={`${rec.label}. ${rs.effects.length ? rs.effects.map((x) => x.text).join('. ') : 'Nothing yet.'}`}
                >
                  <span className="gate-head">
                    {rec.kind === 'sandbox' ? <SandboxIcon /> : <HoneypotIcon />}
                    {rec.label}
                    {!compact && <small>{rec.kind === 'sandbox' ? 'where actions happen' : 'safe trap'}</small>}
                  </span>
                  {!compact && (
                    <span className="gate-effects">
                      {latest.length === 0 ? (
                        <em>Nothing yet</em>
                      ) : (
                        latest.map((x) => (
                          <span key={x.event} className={`gate-effect gate-effect--${x.change}`}>
                            {x.text}
                          </span>
                        ))
                      )}
                    </span>
                  )}
                </button>
              );
            }
            const verdict = rs.verdicts.at(-1)?.verdict ?? null;
            const isCurrent = current?.target?.kind === 'record' && current.target.id === rec.id;
            const preview = rs.state ?? (rec.content ? rec.content.split('\n').at(-1) : null);
            return (
              <button
                key={rec.id}
                type="button"
                className={`record ${rec.planted ? 'is-planted' : ''} ${verdict ? `has-verdict has-verdict--${verdict}` : ''} ${rs.touched ? 'is-touched' : ''} ${isCurrent ? 'is-current' : ''} ${selection?.kind === 'record' && selection.id === rec.id ? 'is-selected' : ''}`}
                style={{ left: pl.x, top: pl.y }}
                onClick={() => onSelect({ kind: 'record', id: rec.id })}
                aria-pressed={selection?.kind === 'record' && selection.id === rec.id}
                aria-label={`${rec.label}${rec.planted ? ', planted by the experiment' : ''}. ${rs.state ? `Now: ${rs.state}.` : ''}${verdict ? ` Evidence for a ${verdict} verdict.` : ''}`}
              >
                <span className="record-label">{rec.label}</span>
                {!compact && (
                  <span className="record-state" key={rs.changedBy ?? 'initial'}>
                    {rs.lastChange && <i className={`record-change record-change--${rs.lastChange}`} aria-hidden="true" />}
                    {rec.planted && !rs.state ? 'planted on purpose' : preview ?? 'not changed yet'}
                  </span>
                )}
                {verdict && (
                  <span className={`record-verdict ${verdictNow && isCurrent ? 'is-new' : ''}`}>
                    <StatusGlyph status={verdict} size={compact ? 12 : 18} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EdgePath({ edge, curve, age, focusClaim, run }: { edge: EdgeState; curve: Curve; age: number; focusClaim: string | null; run: Run }) {
  // Older trails recede so the latest movement reads first; nothing disappears.
  const fade = Math.max(0.38, 1 - age * 0.07);
  const marker = MARKER[edge.channel];
  const offFocus = focusClaim && edge.channel === 'claim' && !edge.events.some((id) => run.events.find((e) => e.id === id)?.claim === focusClaim);
  return (
    <g className={`edge-group ${offFocus ? 'is-off-focus' : ''}`} style={{ opacity: fade }}>
      <path d={curve.d} className={`edge edge--${edge.channel}`} markerEnd={marker} />
      {edge.channel === 'task' && <path d={curve.d} className="edge-task-inner" />}
    </g>
  );
}

function PulseHead({ curve, t, color }: { curve: Curve; t: number; color: string }) {
  const pt = pointOn(curve, t);
  const wake = Math.min(curve.length * 0.22, 78);
  return (
    <g>
      <path
        d={curve.d}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.28"
        style={{ strokeDasharray: `${wake} ${curve.length}`, strokeDashoffset: wake - t * curve.length }}
      />
      <circle cx={pt.x} cy={pt.y} r="11" fill={color} opacity="0.18" />
      <circle cx={pt.x} cy={pt.y} r="5.5" fill={color} stroke="var(--bg)" strokeWidth="2" />
    </g>
  );
}

function ActorRings({ at, st, compact, focusClaim }: { at: Placed; st: ActorState; compact: boolean; focusClaim: string | null }) {
  const has = (list: string[]) => (focusClaim ? list.includes(focusClaim) : list.length > 0);
  const r = at.r + (compact ? 5 : 9);
  const said = has(st.said);
  const exposed = has(st.exposed);
  const acted = has(st.acted);
  const corrected = has(st.corrected);
  return (
    <g>
      {said ? (
        <circle key="said" className="ring ring--said" cx={at.x} cy={at.y} r={r} />
      ) : exposed ? (
        <circle key="exposed" className="ring ring--exposed" cx={at.x} cy={at.y} r={r} />
      ) : null}
      {corrected && <circle key="corrected" className="ring ring--corrected" cx={at.x} cy={at.y} r={r + (compact ? 4 : 7)} />}
      {acted && (
        <rect
          key="acted"
          className="badge badge--acted"
          x={at.x + r * 0.62 - (compact ? 4 : 6)}
          y={at.y - r * 0.78 - (compact ? 4 : 6)}
          width={compact ? 8 : 12}
          height={compact ? 8 : 12}
        />
      )}
    </g>
  );
}

function actorWords(st: ActorState, checking: boolean): string {
  const w: string[] = [];
  if (checking) w.push('checked it');
  else if (st.checked.length) w.push('checked it');
  if (st.said.length) w.push('said it');
  else if (st.exposed.length) w.push('saw it');
  if (st.acted.length) w.push('acted on it');
  if (st.corrected.length) w.push('was corrected');
  return w.join(', ');
}

function JudgeIcon() {
  return <Scale size={22} strokeWidth={1.7} aria-hidden="true" />;
}

function SandboxIcon() {
  return <LucideBox size={15} strokeWidth={1.8} aria-hidden="true" />;
}

function HoneypotIcon() {
  return <FlaskConical size={15} strokeWidth={1.8} aria-hidden="true" />;
}
