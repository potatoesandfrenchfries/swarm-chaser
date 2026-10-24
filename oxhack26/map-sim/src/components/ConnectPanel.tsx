import { ROUTE_COLOURS, FALLBACK_COLOUR, SCENARIO } from "../config";
import { edgeKey, useStore } from "../store/useStore";

export function ConnectPanel() {
  const phase = useStore((s) => s.phase);
  const candidates = useStore((s) => s.candidates);
  const selected = useStore((s) => s.selected);
  const nodes = useStore((s) => s.nodes);
  const toggleEdge = useStore((s) => s.toggleEdge);
  const compute = useStore((s) => s.compute);
  const reset = useStore((s) => s.reset);
  if (phase !== "connecting") return null;

  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <section className="absolute bottom-6 left-4 z-10 w-80 max-w-[calc(100%-2rem)] space-y-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur">
      <h2 className="font-semibold">Join which {SCENARIO.routeLabel}s?</h2>
      <p className="text-xs text-muted-foreground">
        The new {SCENARIO.nodeLabel} splits each ticked section in two. It only helps when it joins two or more{" "}
        {SCENARIO.routeLabel}s, because it works as a free interchange.
      </p>
      <ul className="space-y-1.5">
        {candidates.map((c) => {
          const key = edgeKey(c.edge);
          return (
            <li key={key}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.has(key)} onChange={() => toggleEdge(key)} />
                <span className="size-3 shrink-0 rounded-full" style={{ background: ROUTE_COLOURS[c.edge.route] ?? FALLBACK_COLOUR }} />
                <span className="min-w-0 flex-1 truncate">
                  {c.edge.route}: {name(c.edge.fromId)} to {name(c.edge.toId)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{Math.round(c.distanceM)} m</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <button
          onClick={compute}
          disabled={selected.size === 0}
          className="flex-1 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          Compute impact
        </button>
        <button onClick={reset} className="rounded-xl border px-3 py-2 text-sm hover:bg-muted">
          Cancel
        </button>
      </div>
    </section>
  );
}
