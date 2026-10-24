import { MapPin, RotateCcw } from "lucide-react";
import { SCENARIO } from "../config";
import { useStore } from "../store/useStore";
import { cn } from "../lib/utils";

export function Toolbar() {
  const phase = useStore((s) => s.phase);
  const startPlacing = useStore((s) => s.startPlacing);
  const reset = useStore((s) => s.reset);

  const hint =
    phase === "placing"
      ? `Click the map near a ${SCENARIO.routeLabel}.`
      : phase === "connecting"
        ? `Choose which ${SCENARIO.routeLabel}s the new ${SCENARIO.nodeLabel} joins.`
        : phase === "viewing"
          ? "Green areas get faster, red areas get slower."
          : `Add a ${SCENARIO.nodeLabel} to see who gains and who loses.`;

  return (
    <header className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 rounded-2xl border bg-background/90 p-3 shadow-lg backdrop-blur">
      <h1 className="font-semibold">{SCENARIO.title}</h1>
      <button
        onClick={startPlacing}
        disabled={phase !== "idle"}
        className={cn(
          "flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground",
          phase !== "idle" && "opacity-40"
        )}
      >
        <MapPin className="size-4" /> Add {SCENARIO.nodeLabel}
      </button>
      {phase !== "idle" && (
        <button onClick={reset} className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm hover:bg-muted">
          <RotateCcw className="size-4" /> Reset
        </button>
      )}
      <p className="text-sm text-muted-foreground">{hint}</p>
    </header>
  );
}
