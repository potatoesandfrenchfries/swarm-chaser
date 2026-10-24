import { GitCompare, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { SCENARIO } from "../config";
import { formatChange, formatDuration } from "../lib/format";
import { useStore } from "../store/useStore";
import { cn } from "../lib/utils";

export function Scenarios() {
  const { scenarios, activeId, compareIds, showCompare, load, remove, rename, toggleCompare, setShowCompare } = useStore();
  const [open, setOpen] = useState(true);
  const compared = scenarios.filter((s) => compareIds.has(s.id));

  return (
    <aside className="absolute right-4 top-4 z-10 w-72 max-w-[calc(100%-2rem)] space-y-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between font-semibold">
        Scenarios <span className="text-sm font-normal text-muted-foreground">{scenarios.length}</span>
      </button>

      {open && (
        <>
          {scenarios.length === 0 && <p className="text-sm text-muted-foreground">Saved scenarios appear here.</p>}
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {scenarios.map((s) => (
              <li key={s.id} className={cn("rounded-xl border p-2 text-sm", s.id === activeId && "border-accent")}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Compare ${s.name}`}
                    checked={compareIds.has(s.id)}
                    onChange={() => toggleCompare(s.id)}
                    className="mt-1"
                  />
                  <button onClick={() => load(s.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">avg {formatChange(s.metrics.avgMinutes)} per {SCENARIO.nodeLabel}</span>
                  </button>
                  <button
                    aria-label={`Rename ${s.name}`}
                    onClick={() => {
                      const name = window.prompt("Rename scenario", s.name)?.trim();
                      if (name) rename(s.id, name);
                    }}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    aria-label={`Delete ${s.name}`}
                    onClick={() => remove(s.id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            disabled={compared.length < 2}
            onClick={() => setShowCompare(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-40"
          >
            <GitCompare className="size-4" /> Compare {compared.length || ""} selected
          </button>
        </>
      )}

      {showCompare && compared.length >= 2 && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4" onClick={() => setShowCompare(false)}>
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-2xl border bg-background p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 font-semibold">Compare scenarios</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-normal">Measure</th>
                  {compared.map((s) => (
                    <th key={s.id} className="py-2 pr-3 font-medium text-foreground">
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Average change per node", (s) => formatChange(s.metrics.avgMinutes)],
                    ["Weighted area change", (s) => formatChange(s.metrics.weightedAreaMinutes)],
                    ["Nodes faster", (s) => String(s.metrics.nodesBenefited)],
                    ["Nodes slower", (s) => String(s.metrics.nodesPenalised)],
                    ["Areas faster", (s) => String(s.metrics.areasBenefited)],
                    ["Areas slower", (s) => String(s.metrics.areasPenalised)],
                    ["Biggest gain", (s) => formatDuration(s.metrics.maxBenefit)],
                  ] as [string, (s: (typeof compared)[number]) => string][]
                ).map(([label, value]) => (
                  <tr key={label} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">{label}</td>
                    {compared.map((s) => (
                      <td key={s.id} className="py-2 pr-3 tabular-nums">
                        {value(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setShowCompare(false)} className="mt-4 rounded-xl border px-4 py-2 text-sm hover:bg-muted">
              Close
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
