"use client";

import { Check, Circle, Loader2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { STAGES, type RunSnapshot } from "~/lib/research/schemas";
import { cn } from "~/lib/utils";
import { Markdown } from "./markdown";
import { StatusBadge } from "./status-badge";

const POLL_MS = 2000;

async function fetchSnapshot(runId: string): Promise<RunSnapshot> {
  const res = await fetch(`/api/research/runs/${runId}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body;
}

export function RunView({ runId, autoStart }: { runId: string; autoStart: boolean }) {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(
    () => fetchSnapshot(runId).then(setSnapshot, (e: Error) => setError(e.message)),
    [runId]
  );

  const execute = useCallback(async () => {
    setError(null);
    // Resolves when the whole run is done; polling below shows progress meanwhile.
    const res = await fetch(`/api/research/runs/${runId}/execute`, { method: "POST" });
    if (!res.ok) setError((await res.json()).error);
    void load();
  }, [runId, load]);

  useEffect(() => {
    void load();
  }, [load]);

  // Starting is explicit (`?start=1` from the form) so a page refresh never re-runs.
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void execute();
  }, [autoStart, execute]);

  const status = snapshot?.run.status;
  const active = status && status !== "queued" && status !== "completed" && status !== "failed";
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  if (!snapshot) {
    return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Loading…</p>;
  }

  const { run, events, evidence, findings } = snapshot;
  const currentIndex = STAGES.findIndex((s) => s.key === run.currentStage);
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold">{run.topic}</h1>
          <StatusBadge status={run.status} />
        </div>
        {run.objective && <p className="text-muted-foreground">{run.objective}</p>}
      </div>

      {(error || run.errorMessage) && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error ?? run.errorMessage}</span>
        </div>
      )}

      {(run.status === "queued" || run.status === "failed") && (
        <button
          onClick={() => void execute()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
        >
          {run.status === "failed" ? "Retry" : "Start"}
        </button>
      )}

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {STAGES.map((stage, i) => {
          const done = run.status === "completed" || i < currentIndex;
          const here = i === currentIndex && !!active;
          return (
            <li
              key={stage.key}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                done && "text-foreground",
                !done && !here && "text-muted-foreground"
              )}
            >
              {done ? (
                <Check className="size-4 text-emerald-500" />
              ) : here ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Circle className="size-4" />
              )}
              {stage.label}
            </li>
          );
        })}
      </ol>

      {run.finalReportMarkdown && (
        <section className="rounded-xl border p-6">
          <Markdown>{run.finalReportMarkdown}</Markdown>
        </section>
      )}

      {findings.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Findings</h2>
          <ul className="space-y-3">
            {findings.map((f) => (
              <li key={f.id} className="rounded-xl border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p>{f.claim}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                      f.status === "verified" && "border-emerald-500 text-emerald-600",
                      f.status === "needs-review" && "border-amber-500 text-amber-600"
                    )}
                  >
                    {f.status}
                  </span>
                </div>
                {f.verificationNotes && <p className="mt-2 text-muted-foreground">{f.verificationNotes}</p>}
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {f.evidenceIds.map((id) => {
                    const e = evidenceById.get(id);
                    if (!e) return null;
                    return (
                      <li key={id} className="truncate">
                        {e.url ? (
                          <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">
                            {e.title}
                          </a>
                        ) : (
                          `${e.title} (document)`
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Log</h2>
        <ul className="space-y-1 font-mono text-xs text-muted-foreground">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-foreground">{e.stage}</span> {e.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
