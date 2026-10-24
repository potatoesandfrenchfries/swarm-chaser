"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json()).error ?? "Could not create the project.");
    form.reset();
    router.refresh();
  }

  const field = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent";
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border p-4">
      <h2 className="font-semibold">New project</h2>
      <input name="name" required maxLength={120} placeholder="Name" className={field} />
      <input name="summary" maxLength={500} placeholder="Summary (public on the share page)" className={field} />
      <textarea name="notes" rows={3} maxLength={5000} placeholder="Notes (only visible to people who unlock)" className={field} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        disabled={busy}
        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
