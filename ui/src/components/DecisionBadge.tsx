import { DECISION_WORD, type Decision } from '../model/activity.ts';

export function DecisionBadge({ decision }: { decision: Decision }) {
  return <span className={`decision decision--${decision}`}>{DECISION_WORD[decision]}</span>;
}
