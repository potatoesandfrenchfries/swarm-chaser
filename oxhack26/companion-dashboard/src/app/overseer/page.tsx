"use client";

import Link from "next/link";
import { ChatPanel } from "~/components/chat-panel";
import { NotesPanel } from "~/components/notes-panel";
import { TaskList } from "~/components/task-list";
import { useAppState } from "~/lib/use-app-state";
import { cn } from "~/lib/utils";

export default function OverseerPage() {
  const { state, error, refresh, setState } = useAppState("overseer");

  if (!state) {
    return <p className="p-6 text-muted-foreground">{error ?? "Loading…"}</p>;
  }

  const open = state.notes.filter((n) => !n.resolved);
  const urgent = open.filter((n) => n.severity === "urgent").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/" className="text-sm text-muted-foreground underline">
            Switch view
          </Link>
          <h1 className="text-2xl font-semibold">{state.member.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{state.member.profile}</p>
        </div>
        <p
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            urgent ? "border-destructive text-destructive" : open.length ? "border-amber-500 text-amber-600" : "text-muted-foreground"
          )}
        >
          {open.length} open concern{open.length === 1 ? "" : "s"}
          {urgent ? `, ${urgent} urgent` : ""}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-3">
          <h2 className="font-semibold">Concerns</h2>
          <NotesPanel notes={state.notes} onChange={refresh} />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">To-do list</h2>
          <TaskList tasks={state.tasks} role="overseer" canRemove onChange={refresh} />
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Assistant</h2>
          <div className="h-96 overflow-hidden rounded-2xl border">
            <ChatPanel
              role="overseer"
              messages={state.messages}
              placeholder="Ask how the day is going…"
              onState={setState}
            />
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Recent conversation with {state.member.name}</h2>
        <ul className="space-y-1 text-sm">
          {state.memberMessages.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}
          {state.memberMessages.map((m) => (
            <li key={m.id}>
              <span className="text-muted-foreground">{m.role === "user" ? state.member.name : "Companion"}:</span>{" "}
              {m.text}
              {m.route && m.role === "assistant" && (
                <span className="ml-2 rounded border px-1 text-xs text-muted-foreground">{m.route}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
