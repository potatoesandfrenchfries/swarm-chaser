"use client";

import { send } from "~/lib/use-app-state";
import type { Note, Severity } from "~/lib/types";
import { cn } from "~/lib/utils";

const BADGE: Record<Severity, string> = {
  info: "border-border text-muted-foreground",
  watch: "border-amber-500 text-amber-600",
  urgent: "border-destructive text-destructive",
};

export function NotesPanel({ notes, onChange }: { notes: Note[]; onChange: () => void }) {
  if (notes.length === 0) return <p className="text-sm text-muted-foreground">No concerns recorded.</p>;
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.id} className={cn("rounded-xl border p-3 text-sm", n.resolved && "opacity-60")}>
          <div className="flex items-start justify-between gap-3">
            <p>{n.text}</p>
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs", BADGE[n.severity])}>
              {n.severity}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <time dateTime={n.createdAt}>{n.createdAt} UTC</time>
            <button
              onClick={() => send(`/api/notes/${n.id}`, "PATCH", { resolved: !n.resolved }).then(onChange)}
              className="underline"
            >
              {n.resolved ? "Reopen" : "Mark resolved"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
