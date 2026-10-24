import { log } from "./log.js";
import { spawnReplacement } from "./members.js";
import type { MemberDefinition } from "./schemas.js";
import type { CouncilState } from "./state.js";

const EXECUTION_THRESHOLD = 0.3;

/** A member's score: wins and overridden-in-their-favour votes, minus a defection penalty. */
export function memberScore(stats: CouncilState["members"][number]["stats"]) {
  if (stats.totalDecisions === 0) return 0.5; // a new member gets the benefit of the doubt
  const base = (stats.wins + stats.overrideMatches) / stats.totalDecisions;
  return Math.max(0, base - (stats.defections * 0.5) / stats.totalDecisions);
}

/**
 * Replace the council's worst member if they fall below the threshold. The
 * replacement keeps the name (it is a vote option) and the seat; it gets a fresh
 * record and one question borrowed from the best member.
 */
export function runReaper(state: CouncilState, pool: MemberDefinition[]) {
  const ranked = state.members.map((member) => ({ member, score: memberScore(member.stats) })).sort((a, b) => a.score - b.score);
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];
  if (!worst || !best || worst.member === best.member || worst.score >= EXECUTION_THRESHOLD) return null;

  const replacement = spawnReplacement(worst.member, best.member, pool);
  state.members = state.members.map((m) => (m === worst.member ? replacement : m));
  state.emit({
    type: "reaper",
    eliminated: `${worst.member.definition.name}-v${worst.member.generation}`,
    replacement: `${replacement.definition.name}-v${replacement.generation}`,
  });
  log(`Reaper replaced ${worst.member.definition.name}-v${worst.member.generation} (score ${worst.score.toFixed(2)})`);
  return replacement;
}
