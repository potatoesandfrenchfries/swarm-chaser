"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProject({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard");
    else setBusy(false);
  }

  return (
    <button onClick={remove} disabled={busy} className="text-sm text-destructive underline disabled:opacity-50">
      Delete project
    </button>
  );
}
