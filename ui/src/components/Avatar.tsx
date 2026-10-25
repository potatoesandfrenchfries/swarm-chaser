import { Box, FileText, Archive } from 'lucide-react';
import type { Run, RecordNode } from '../model/types.ts';

/** The icon a record is drawn with wherever it appears, so the sandbox and honeypot look the same in every view. */
export function recordIcon(record: RecordNode | null | undefined) {
  return record?.kind === 'sandbox' ? Box : record?.kind === 'honeypot' ? Archive : FileText;
}

/** Soft blob outlines on a 40×40 grid; each agent gets one, so the cast is told apart by shape as well as colour. */
const SHAPES = [
  'M21 5C31 5 36 13 36 22C36 31 29 36 20 36C11 36 5 30 5 22C5 13 11 5 21 5Z',
  'M9 34C5 34 4 31 6 27L17 8C19 4 23 4 25 8L35 27C37 31 35 34 31 34Z',
  'M10 31C5 31 3 26 6 22C3 18 6 12 12 14C13 8 20 7 23 11C27 7 34 9 33 15C38 16 38 23 34 25C37 29 33 34 28 32C25 36 19 36 16 33C14 35 11 34 10 31Z',
  'M20 4C29 4 36 11 36 20C36 29 29 36 20 36C11 36 4 29 4 20C4 11 11 4 20 4Z',
  'M8 33C6 33 5 30 6 27C8 18 12 7 22 6C31 5 36 13 36 22C36 29 31 33 26 33Z',
];
/** How far down each shape's eyes sit; the triangle is narrow at the top, so its eyes go lower. */
const EYE_DROP = [0, 7, 1, 0, 1];
const COLORS = ['#e8509b', '#8b5cf6', '#e5484d', '#f07a2a', '#4fb3a3', '#3b82f6'];
/** Chaser's outline: a ghost with a flat foot, drawn in ink so it reads as the one watching. */
const GHOST = 'M7 34C7 18 12 6 22 6C31 6 35 14 35 23C35 29 33 34 28 34Z';

export function Avatar({ run, actorId, size = 42 }: { run: Run; actorId: string; size?: number }) {
  const actor = run.actors.find((a) => a.id === actorId);
  const isVeto = actor?.kind === 'monitor';
  const i = Math.max(0, run.actors.filter((a) => a.kind === 'agent').findIndex((a) => a.id === actorId));
  const path = isVeto ? GHOST : SHAPES[i % SHAPES.length];
  const fill = isVeto ? 'var(--ink)' : COLORS[i % COLORS.length];
  const eye = isVeto ? '#fff' : '#2a1414';
  const drop = isVeto ? 2 : EYE_DROP[i % EYE_DROP.length];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className="avatar" aria-hidden="true">
      <path d={path} fill={fill} />
      <g transform={`translate(0 ${drop})`}>
        <rect x="15" y="13" width="4.4" height="9" rx="2.2" fill={eye} transform="rotate(-16 17.2 17.5)" />
        <rect x="23" y="12" width="4.4" height="9" rx="2.2" fill={eye} transform="rotate(-16 25.2 16.5)" />
      </g>
    </svg>
  );
}
