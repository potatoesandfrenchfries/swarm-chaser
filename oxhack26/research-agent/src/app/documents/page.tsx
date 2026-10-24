"use client";

import { Upload } from "lucide-react";
import { useEffect, useState } from "react";

interface Doc {
  documentId: string;
  fileName: string | null;
  totalChunks: number;
  uploadDate: string | null;
}

async function fetchDocs(): Promise<Doc[]> {
  const res = await fetch("/api/documents");
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body.documents;
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDocs().then(setDocs, (e: Error) => setError(e.message));
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error);
    fetchDocs().then(setDocs, (e: Error) => setError(e.message));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Documents</h1>
        <p className="mt-1 text-muted-foreground">
          PDF, DOCX or TXT. Each file is chunked and embedded so a research run can search it.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-muted-foreground hover:bg-muted">
        <Upload className="size-5" />
        {busy ? "Processing…" : "Choose a file to upload"}
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void upload(file);
          }}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="divide-y rounded-xl border">
        {docs.length === 0 && <li className="p-4 text-sm text-muted-foreground">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.documentId} className="flex items-center justify-between gap-4 p-4 text-sm">
            <span className="truncate font-medium">{d.fileName ?? d.documentId}</span>
            <span className="shrink-0 text-muted-foreground">{d.totalChunks} chunks</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
