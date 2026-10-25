import { useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { chaptersOf } from '../model/replay.ts';
import type { Run } from '../model/types.ts';
import { SPEEDS, useStore } from '../state/store.tsx';
import { useElementSize } from '../state/hooks.ts';
import { actorName } from '../lib/words.ts';
import { EventMark } from './Glyphs.tsx';

const PAD = 10;

/**
 * Play controls plus one simple timeline: a mark per step, coloured by what happened, with the key
 * moments named above it. Pointer and keyboard both seek through a real range input.
 */
export function Transport({ run, focusClaim }: { run: Run; focusClaim: string | null }) {
  const { state, dispatch } = useStore();
  const [trackRef, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = run.events.length;
  const last = n - 1;
  const width = size.width;
  const step = width > 2 * PAD ? (width - 2 * PAD) / Math.max(1, n) : 0;
  const x = (i: number) => PAD + (i + 0.5) * step;
  const cursorX = state.cursor < 0 ? PAD : x(state.cursor);
  const hovered = hover !== null && hover >= 0 ? run.events[hover] : null;

  // Chapter labels sit in two rows; a label drops to the second row when it would collide with the one before.
  const chapters = useMemo(() => {
    const lastEnd = [-Infinity, -Infinity];
    return chaptersOf(run, focusClaim).map((c) => {
      const w = c.label.length * 6.9 + 22;
      let left = Math.max(0, Math.min(x(c.seq) - 8, width - w));
      const row = left > lastEnd[0] + 6 ? 0 : left > lastEnd[1] + 6 ? 1 : lastEnd[0] <= lastEnd[1] ? 0 : 1;
      left = Math.min(Math.max(left, lastEnd[row] + 6), Math.max(0, width - w));
      lastEnd[row] = left + w;
      return { ...c, left, row };
    });
  }, [run, focusClaim, step, width]);

  const seekFromPointer = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    if (px < PAD) return -1;
    return Math.max(-1, Math.min(last, Math.floor((px - PAD) / step)));
  };

  return (
    <section className="dock glass" aria-label="Replay controls">
      <div className="dock-buttons">
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'seek', cursor: -1 })} aria-label="Restart from the beginning" title="Restart (Home)">
          <RotateCcw size={17} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'step', delta: -1 })} disabled={state.cursor < 0} aria-label="Previous step" title="Previous step (←)">
          <SkipBack size={17} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button type="button" className={`play-btn ${state.playing ? 'is-playing' : ''}`} onClick={() => dispatch({ type: 'toggle' })} aria-label={state.playing ? 'Pause' : state.cursor >= last ? 'Replay from the start' : 'Play'} title="Play or pause (Space)">
          {state.playing ? <Pause size={19} fill="currentColor" strokeWidth={0} aria-hidden="true" /> : <Play size={19} fill="currentColor" strokeWidth={0} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'step', delta: 1 })} disabled={state.cursor >= last} aria-label="Next step" title="Next step (→)">
          <SkipForward size={17} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <label className="speed">
          <span className="sr-only">Playback speed</span>
          <select value={state.speed} onChange={(e) => dispatch({ type: 'speed', speed: Number(e.target.value) })}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="thread" ref={trackRef}>
        {width > 0 && chapters.length > 0 && (
          <div className="chapters" aria-label="Key moments">
            {chapters.map((c) => (
              <button
                key={c.seq}
                type="button"
                className={`chapter chapter--${c.tone} ${state.cursor >= c.seq ? 'is-past' : ''}`}
                style={{ left: c.left, top: c.row * 20 }}
                onClick={() => dispatch({ type: 'seek', cursor: c.seq })}
                aria-label={`Go to step ${c.seq + 1}: ${c.label}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
        <svg
          width={width}
          height={32}
          className="thread-svg"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            dispatch({ type: 'seek', cursor: seekFromPointer(e.clientX, e.currentTarget.getBoundingClientRect()) });
          }}
          onPointerMove={(e) => {
            const i = seekFromPointer(e.clientX, e.currentTarget.getBoundingClientRect());
            setHover(i);
            if (e.buttons === 1) dispatch({ type: 'seek', cursor: i });
          }}
          onPointerLeave={() => setHover(null)}
          aria-hidden="true"
        >
          {width > 0 && (
            <>
              <line x1={PAD} x2={width - PAD} y1={16} y2={16} className="track" />
              <line x1={PAD} x2={cursorX} y1={16} y2={16} className="track track--done" />
              {run.events.map((e) => (
                <g key={e.id} transform={`translate(${x(e.seq) - 6} 10)`}>
                  {e.seq === state.cursor && <circle cx="6" cy="6" r="10" className="mark-ring" />}
                  <EventMark type={e.type} verdict={e.verdict} size={12} faint={e.seq > state.cursor} />
                </g>
              ))}
              {hover !== null && hover >= 0 && <line x1={x(hover)} x2={x(hover)} y1={2} y2={30} className="hoverline" />}
            </>
          )}
        </svg>
        <input
          className="thread-range"
          type="range"
          min={-1}
          max={last}
          step={1}
          value={state.cursor}
          onChange={(e) => dispatch({ type: 'seek', cursor: Number(e.target.value) })}
          aria-label="Replay position"
          aria-valuetext={state.cursor < 0 ? 'Before the first step' : `Step ${state.cursor + 1} of ${n}: ${run.events[state.cursor].summary}`}
        />
        {hovered && (
          <div className="thread-tip glass-strong" style={{ left: Math.min(Math.max(x(hovered.seq), 120), width - 120) }} role="presentation">
            <strong>
              Step {hovered.seq + 1}, {actorName(run, hovered.actor)}
            </strong>
            {hovered.summary}
          </div>
        )}
      </div>

      {state.live && !state.live.follow && (
        <button type="button" className="chip-btn dock-now" onClick={() => dispatch({ type: 'live-follow' })}>
          Jump to now
        </button>
      )}
      <div className="dock-count" aria-live="off">
        <span className="dock-step">
          <b>{state.cursor + 1}</b>
          <span>/ {n}</span>
        </span>
        <span className="dock-state">{state.live ? (state.live.follow ? 'Following live' : 'Behind live') : state.playing ? 'Playing' : state.cursor >= last ? 'The end' : 'Paused'}</span>
      </div>
    </section>
  );
}
