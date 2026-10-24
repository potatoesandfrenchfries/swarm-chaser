import { IMPACT_COLOURS, SCENARIO } from "../config";
import { capitalise, formatChange, formatDuration } from "../lib/format";
import { useStore } from "../store/useStore";

export function Results() {
  const phase = useStore((s) => s.phase);
  const impact = useStore((s) => s.impact);
  const activeId = useStore((s) => s.activeId);
  const save = useStore((s) => s.save);
  if (phase !== "viewing" || !impact) return null;
  const m = impact.metrics;

  const rows: [string, string][] = [
    [`Average change per ${SCENARIO.nodeLabel}`, formatChange(m.avgMinutes)],
    [`${capitalise(SCENARIO.nodeLabel)}s faster / slower`, `${m.nodesBenefited} / ${m.nodesPenalised}`],
    ["Areas faster / slower", `${m.areasBenefited} / ${m.areasPenalised}`],
    ["Weighted area change", formatChange(m.weightedAreaMinutes)],
    ["Biggest gain", formatDuration(m.maxBenefit)],
    ["Biggest loss", formatDuration(m.maxPenalty)],
  ];

  return (
    <section className="absolute bottom-6 left-4 z-10 w-80 max-w-[calc(100%-2rem)] space-y-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur">
      <h2 className="font-semibold">Impact</h2>
      <p className="text-xs text-muted-foreground">
        Change in mean journey time to every other {SCENARIO.nodeLabel}. Negative is faster.
      </p>
      <dl className="space-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-2.5 rounded-full" style={{ background: IMPACT_COLOURS.benefit }} /> faster
        <span className="size-2.5 rounded-full" style={{ background: IMPACT_COLOURS.neutral }} /> same
        <span className="size-2.5 rounded-full" style={{ background: IMPACT_COLOURS.penalty }} /> slower
      </div>
      {!activeId && (
        <button onClick={() => save()} className="w-full rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted">
          Save scenario
        </button>
      )}
    </section>
  );
}
