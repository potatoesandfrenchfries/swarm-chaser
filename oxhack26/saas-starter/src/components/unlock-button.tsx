"use client";

import { useState } from "react";

export function UnlockButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/share/${slug}/unlock`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(body.error ?? "Could not start checkout.");
    }
    window.location.href = body.url; // Stripe Checkout
  }

  return (
    <div className="space-y-2">
      <button
        onClick={unlock}
        disabled={busy}
        className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Unlock the notes"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
