import type { Basis, ClaimStatus, Provenance, Run } from '../model/types.ts';

export const STATUS_WORD: Record<ClaimStatus, string> = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  unverifiable: 'Unverifiable',
  unchecked: 'Not checked yet',
};

export const BASIS_WORD: Record<Basis, string> = {
  observed: 'Observed in the run log',
  inferred: 'Inferred by a rule over the log',
  derived: 'Derived by a model, not in the log',
};

export const PROVENANCE_WORD: Record<Provenance, string> = {
  synthetic: 'Made-up example',
  recorded: 'Recorded run',
  live: 'Live',
};

export const PROVENANCE_NOTE: Record<Provenance, string> = {
  synthetic: 'Written by hand to show how the tool works. Not real research data.',
  recorded: 'Replayed from a captured run.',
  live: 'Events arriving from a running source.',
};

/** A run's set-up in a few words, so runs with the same title can be told apart. */
export function setupWords(d: { attack: boolean; veto: boolean }): string {
  return `${d.attack ? 'Attack' : 'No attack'}, ${d.veto ? 'with' : 'without'} Chaser`;
}

export function actorName(run: Run, id: string): string {
  return run.actors.find((a) => a.id === id)?.name ?? id;
}

export function nodeName(run: Run, ref: { kind: 'actor' | 'record'; id: string } | null): string {
  if (!ref) return '';
  if (ref.kind === 'actor') return actorName(run, ref.id);
  return run.records.find((r) => r.id === ref.id)?.label ?? ref.id;
}

export function monogram(name: string): string {
  const numbered = /^agent\s*(\d+)$/i.exec(name.trim());
  if (numbered) return `A${numbered[1]}`;
  const parts = name.split(/[\s-_.]+/).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

/**
 * The vendor mark to show for a recorded model string, or null. Only real model strings from a record
 * get a mark; synthetic actors have model null and keep their monogram.
 */
export function vendorOf(model: string | null): 'anthropic' | 'openai' | 'gemini' | null {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes('claude') || m.includes('anthropic')) return 'anthropic';
  if (/(^|[/-])(gpt|o1|o3|o4|chatgpt)/.test(m) || m.includes('openai')) return 'openai';
  if (m.includes('gemini')) return 'gemini';
  return null;
}
