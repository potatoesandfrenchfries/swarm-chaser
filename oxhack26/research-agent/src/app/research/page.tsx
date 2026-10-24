"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Run } from "~/lib/research/schemas";
import { StatusBadge } from "~/components/status-badge";

interface Doc {
  documentId: string;
  fileName: string | null;
}

export default function ResearchPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/research/runs").then(async (r) => r.ok && setRuns((await r.json()).runs));
    void fetch("/api/documents").then(async (r) => r.ok && setDocs((await r.json()).documents));
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/research/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic, objective: objective || null, documentIds: selected }),
    });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(body.error);
    }
    // The run page starts the execution, so the user lands on live progress.
    router.push(`/research/${body.runId}?start=1`);
  }

  const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
  return (
    <div className="space-y-10">
      <form onSubmit={start} className="space-y-4">
        <h1 className="text-2xl font-semibold">New research run</h1>
        <input
          required
          minLength={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic, e.g. “State of open-source vector databases”"
          className={field}
        />
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Objective (optional): what decision will this inform?"
          rows={2}
          className={field}
        />
        {docs.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm text-muted-foreground">Search these documents too</legend>
            {docs.map((d) => (
              <label key={d.documentId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(d.documentId)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, d.documentId] : s.filter((id) => id !== d.documentId)
                    )
                  }
                />
                {d.fileName ?? d.documentId}
              </label>
            ))}
          </fieldset>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start research"}
        </button>
      </form>

      <section>
        <h2 className="mb-3 font-semibold">Runs</h2>
        <ul className="divide-y rounded-xl border">
          {runs.length === 0 && <li className="p-4 text-sm text-muted-foreground">No runs yet.</li>}
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/research/${run.id}`}
                className="flex items-center justify-between gap-4 p-4 text-sm hover:bg-muted"
              >
                <span className="truncate font-medium">{run.topic}</span>
                <StatusBadge status={run.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
