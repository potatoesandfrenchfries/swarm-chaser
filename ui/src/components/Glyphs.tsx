import type { ClaimStatus, EventType } from '../model/types.ts';
import { STATUS_WORD } from '../lib/words.ts';

/** Status as shape + word, never colour alone. */
export function StatusGlyph({ status, size = 16 }: { status: ClaimStatus; size?: number }) {
  const r = size / 2;
  if (status === 'contradicted') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="glyph">
        <circle cx={r} cy={r} r={r} fill="var(--contradicted)" />
        <path d={`M${r * 0.6} ${r * 0.6}L${r * 1.4} ${r * 1.4}M${r * 1.4} ${r * 0.6}L${r * 0.6} ${r * 1.4}`} stroke="var(--bg)" strokeWidth={size / 8} strokeLinecap="round" />
      </svg>
    );
  }
  if (status === 'supported') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="glyph">
        <circle cx={r} cy={r} r={r} fill="var(--supported)" />
        <path d={`M${r * 0.55} ${r * 1.02}L${r * 0.88} ${r * 1.35}L${r * 1.45} ${r * 0.7}`} stroke="var(--bg)" strokeWidth={size / 8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'unverifiable') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="glyph">
        <circle cx={r} cy={r} r={r - 1} fill="none" stroke="var(--unverifiable)" strokeWidth="1.4" strokeDasharray="2.5 2.5" />
        <text x={r} y={r + size * 0.18} textAnchor="middle" fontSize={size * 0.62} fontWeight="600" fill="var(--ink-muted)" fontFamily="var(--font-ui)">?</text>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="glyph">
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="var(--ink-faint)" strokeWidth="1.2" />
    </svg>
  );
}

export function StatusTag({ status }: { status: ClaimStatus }) {
  return (
    <span className={`status-tag status-tag--${status}`}>
      <StatusGlyph status={status} size={14} />
      {STATUS_WORD[status]}
    </span>
  );
}

/** One mark per event type, shared by the scrubber, the ledger and the inspector. */
export function EventMark({ type, verdict, size = 12, faint = false }: { type: EventType; verdict?: string | null; size?: number; faint?: boolean }) {
  const s = size;
  const h = s / 2;
  const o = faint ? 0.38 : 1;
  const common = { width: s, height: s, viewBox: `0 0 ${s} ${s}`, 'aria-hidden': true as const, className: 'event-mark', style: { opacity: o } };
  switch (type) {
    case 'read':
      return (
        <svg {...common}>
          <line x1={h} y1={s * 0.15} x2={h} y2={s * 0.85} stroke="var(--ink-muted)" strokeWidth="1.4" />
        </svg>
      );
    case 'delegate':
      return (
        <svg {...common}>
          <line x1={h - 2} y1={s * 0.15} x2={h - 2} y2={s * 0.85} stroke="var(--ink-muted)" strokeWidth="1.4" />
          <line x1={h + 2} y1={s * 0.15} x2={h + 2} y2={s * 0.85} stroke="var(--ink-muted)" strokeWidth="1.4" />
        </svg>
      );
    case 'claim':
      return (
        <svg {...common}>
          <circle cx={h} cy={h} r={h - 0.5} fill="var(--claim)" />
          <circle cx={h} cy={h} r={h * 0.35} fill="var(--bg)" />
        </svg>
      );
    case 'repeat':
    case 'endorse':
      return (
        <svg {...common}>
          <circle cx={h} cy={h} r={h * 0.72} fill="var(--claim)" />
        </svg>
      );
    case 'action':
      return (
        <svg {...common}>
          <rect x={s * 0.14} y={s * 0.14} width={s * 0.72} height={s * 0.72} fill="var(--ink)" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <rect x={h - s * 0.3} y={h - s * 0.3} width={s * 0.6} height={s * 0.6} transform={`rotate(45 ${h} ${h})`} fill={verdict === 'contradicted' ? 'var(--contradicted)' : verdict === 'supported' ? 'var(--supported)' : 'none'} stroke={verdict === 'unverifiable' ? 'var(--ink-muted)' : 'none'} strokeDasharray="2 2" />
        </svg>
      );
    case 'intervene':
      return (
        <svg {...common}>
          <path d={`M${s * 0.15} ${s * 0.82}L${h} ${s * 0.2}L${s * 0.85} ${s * 0.82}`} fill="none" stroke="var(--correction)" strokeWidth="1.8" strokeDasharray="3 1.5" />
        </svg>
      );
    case 'submit':
      return (
        <svg {...common}>
          <path d={`M${h} ${s * 0.12}L${s * 0.88} ${s * 0.82}H${s * 0.12}Z`} fill="var(--ink)" />
        </svg>
      );
    case 'allow':
      return (
        <svg {...common}>
          <rect x={s * 0.14} y={s * 0.14} width={s * 0.72} height={s * 0.72} rx="1.5" fill="var(--supported)" />
        </svg>
      );
    case 'divert':
      return (
        <svg {...common}>
          <rect x={s * 0.14} y={s * 0.14} width={s * 0.72} height={s * 0.72} rx="1.5" fill="var(--contradicted)" />
        </svg>
      );
    case 'correct':
    case 'dispute':
      return (
        <svg {...common}>
          <path d={`M${s * 0.15} ${s * 0.82}L${h} ${s * 0.2}L${s * 0.85} ${s * 0.82}`} fill="none" stroke="var(--correction)" strokeWidth="2" />
        </svg>
      );
  }
}
