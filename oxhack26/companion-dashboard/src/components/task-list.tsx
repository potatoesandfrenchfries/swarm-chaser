"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { send } from "~/lib/use-app-state";
import type { Role, Task } from "~/lib/types";
import { cn } from "~/lib/utils";

export function TaskList({
  tasks,
  role,
  large = false,
  canRemove = false,
  onChange,
}: {
  tasks: Task[];
  role: Role;
  large?: boolean;
  /** The overseer can delete items; the member can only tick them off. */
  canRemove?: boolean;
  onChange: () => void;
}) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {tasks.length === 0 && <li className="text-muted-foreground">Nothing on the list.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-xl border p-3">
            <button
              onClick={() => run(() => send(`/api/tasks/${t.id}`, "PATCH", { done: !t.done }))}
              aria-label={t.done ? `Mark “${t.title}” not done` : `Mark “${t.title}” done`}
              aria-pressed={t.done}
              className={cn(
                "grid shrink-0 place-items-center rounded-lg border-2",
                large ? "size-9" : "size-6",
                t.done && "border-accent bg-accent text-accent-foreground"
              )}
            >
              {t.done && <Check className="size-4" />}
            </button>
            <span className={cn("flex-1", large && "text-xl", t.done && "text-muted-foreground line-through")}>
              {t.title}
            </span>
            {canRemove && (
              <button
                onClick={() => run(() => send(`/api/tasks/${t.id}`, "DELETE"))}
                aria-label={`Remove “${t.title}”`}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = title.trim();
          if (!value) return;
          setTitle("");
          void run(() => send("/api/tasks", "POST", { title: value, role }));
        }}
        className="flex gap-2"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add an item…"
          className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button aria-label="Add item" className="grid size-10 place-items-center rounded-xl border hover:bg-muted">
          <Plus className="size-4" />
        </button>
      </form>
    </div>
  );
}
