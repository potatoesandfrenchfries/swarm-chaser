import { SCHEMA, type Bundle, type ReplayEvent, type Run } from './types.ts';

const EVENT_TYPES = new Set(['read', 'delegate', 'claim', 'repeat', 'endorse', 'dispute', 'action', 'check', 'intervene', 'correct', 'submit', 'allow', 'divert']);
const VERDICTS = new Set(['supported', 'contradicted', 'unverifiable']);
const BASES = new Set(['observed', 'inferred', 'derived']);
const PROVENANCES = new Set(['recorded', 'live', 'synthetic']);

/**
 * Every rule a bundle must pass before any view renders it. Returns the problems found, empty when
 * the bundle is usable. The UI refuses a bundle with problems and lists them; it never patches data.
 */
export function validateBundle(input: unknown): string[] {
  const problems: string[] = [];
  const b = input as Bundle;
  if (!b || typeof b !== 'object') return ['The bundle is not a JSON object.'];
  if (b.schema !== SCHEMA) problems.push(`Unknown schema ${JSON.stringify(b.schema)}; expected ${SCHEMA}.`);
  if (!PROVENANCES.has(b.provenance)) problems.push(`Unknown provenance ${JSON.stringify(b.provenance)}.`);
  if (typeof b.id !== 'string' || !b.id) problems.push('The bundle has no id.');
  if (!Array.isArray(b.runs) || b.runs.length === 0) return [...problems, 'The bundle has no runs.'];
  const runIds = new Set<string>();
  for (const run of b.runs) {
    if (runIds.has(run.id)) problems.push(`Run id ${run.id} is used twice.`);
    runIds.add(run.id);
    // A run can never claim more certainty than its bundle: a synthetic bundle holds only synthetic runs.
    if (run.provenance !== b.provenance) problems.push(`Run ${run.id} is ${run.provenance} inside a ${b.provenance} bundle.`);
    problems.push(...validateRun(run).map((p) => `Run ${run.id}: ${p}`));
  }
  if (b.experiment && !b.runs.some((r) => r.claims.some((c) => c.id === b.experiment!.focus_claim))) {
    problems.push(`The experiment's focus claim ${b.experiment.focus_claim} is in no run.`);
  }
  return problems;
}

/**
 * A live run is validated as it grows. The only allowance: a claim may be declared before the step that
 * first states it has streamed in. Everything else must already hold.
 */
export function validateLiveBundle(input: unknown): string[] {
  const b = input as Bundle;
  const run = b?.runs?.[0];
  return validateBundle(input).filter((p) => {
    const m = /claim (\S+) has unknown origin (\S+)\./.exec(p);
    return !(m && run && !run.events.some((e) => e.id === m[2]));
  });
}

function validateRun(run: Run): string[] {
  const problems: string[] = [];
  const actors = new Set(run.actors.map((a) => a.id));
  const records = new Map(run.records.map((r) => [r.id, r]));
  const claims = new Map(run.claims.map((c) => [c.id, c]));
  const ids = new Set<string>();
  for (const id of [...actors, ...records.keys(), ...claims.keys()]) {
    if (ids.has(id)) problems.push(`id ${id} names two things.`);
    ids.add(id);
  }

  const events: ReplayEvent[] = run.events;
  const seqOf = new Map<string, number>();
  events.forEach((e, i) => {
    if (e.seq !== i) problems.push(`event ${e.id} has seq ${e.seq} at position ${i}; seq must be 0..n-1 in order.`);
    if (seqOf.has(e.id) || ids.has(e.id)) problems.push(`event id ${e.id} is not unique.`);
    seqOf.set(e.id, e.seq);
  });

  for (const e of events) {
    if (!EVENT_TYPES.has(e.type)) problems.push(`event ${e.id} has unknown type ${e.type}.`);
    if (!BASES.has(e.basis)) problems.push(`event ${e.id} has unknown basis ${e.basis}.`);
    if (!actors.has(e.actor)) problems.push(`event ${e.id} names unknown actor ${e.actor}.`);
    if (e.target) {
      const known = e.target.kind === 'actor' ? actors.has(e.target.id) : records.has(e.target.id);
      if (!known) problems.push(`event ${e.id} targets unknown ${e.target.kind} ${e.target.id}.`);
    }
    if (e.claim !== null && !claims.has(e.claim)) problems.push(`event ${e.id} refers to unknown claim ${e.claim}.`);
    if (e.type === 'check') {
      if (!e.verdict || !VERDICTS.has(e.verdict)) problems.push(`check ${e.id} has no valid verdict.`);
      if (!e.claim) problems.push(`check ${e.id} does not say which claim it checks.`);
    } else if (e.verdict !== null) {
      problems.push(`event ${e.id} is a ${e.type} but carries a verdict.`);
    }
    for (const q of e.evidence) {
      const rec = records.get(q.record);
      if (!rec) problems.push(`event ${e.id} cites unknown record ${q.record}.`);
      else if (rec.content !== null && !rec.content.includes(q.quote)) {
        problems.push(`event ${e.id} quotes ${JSON.stringify(q.quote)}, which is not in ${rec.label}.`);
      }
    }
    for (const c of e.causes) {
      const s = seqOf.get(c);
      if (s === undefined) problems.push(`event ${e.id} depends on unknown event ${c}.`);
      else if (s >= e.seq) problems.push(`event ${e.id} depends on ${c}, which does not come before it.`);
    }
  }

  for (const c of run.claims) {
    const origin = events.find((e) => e.id === c.origin);
    if (!origin) {
      problems.push(`claim ${c.id} has unknown origin ${c.origin}.`);
      continue;
    }
    if (origin.claim !== c.id) problems.push(`claim ${c.id}'s origin ${c.origin} is about ${origin.claim}.`);
    if (origin.text !== null && !origin.text.includes(c.text)) {
      problems.push(`claim ${c.id}'s text is not verbatim in its origin event ${c.origin}.`);
    }
    const earlier = events.find((e) => e.claim === c.id && e.seq < origin.seq && e.type !== 'read');
    if (earlier) problems.push(`claim ${c.id} is used by ${earlier.id} before its origin.`);
  }
  return problems;
}
