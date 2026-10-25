import type { ReplayEvent, Run } from './types.ts';

/** What happened to one event, in the words an operator scans for. */
export type Decision = 'blocked' | 'allowed' | 'flagged' | 'held' | 'leaked' | 'ran' | 'message' | 'read';

export const DECISION_WORD: Record<Decision, string> = {
  blocked: 'Blocked',
  allowed: 'Allowed',
  flagged: 'Flagged',
  held: 'Held for review',
  leaked: 'Leaked',
  ran: 'Ran',
  message: 'Message',
  read: 'Read',
};

/**
 * A tool call that carries a planted claim and runs with no monitor in the way counts as a leak;
 * every other event is named by what the monitor did with it, or by its kind when nothing checked it.
 */
export function decisionOf(e: ReplayEvent): Decision {
  if (e.type === 'divert') return 'blocked';
  if (e.type === 'allow') return 'allowed';
  if (e.type === 'check') return e.verdict === 'contradicted' ? 'flagged' : 'allowed';
  if (e.type === 'submit') return 'held';
  if (e.type === 'action') return e.claim ? 'leaked' : 'ran';
  if (e.type === 'read') return 'read';
  return 'message';
}

/** Events an operator should look at: anything blocked, flagged or leaked. */
export function isAlert(e: ReplayEvent): boolean {
  const d = decisionOf(e);
  return d === 'blocked' || d === 'flagged' || d === 'leaked';
}

export function hasMonitor(run: Run): boolean {
  return run.actors.some((a) => a.kind === 'monitor');
}

/** Tool calls an agent made or asked the monitor to make: the actions VETO is there to judge. */
export function isToolCall(e: ReplayEvent): boolean {
  return Boolean(e.tool) && e.type !== 'read';
}
