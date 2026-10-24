"use client";

import Link from "next/link";
import { ChatPanel } from "~/components/chat-panel";
import { TaskList } from "~/components/task-list";
import { useAppState } from "~/lib/use-app-state";

export default function MemberPage() {
  const { state, error, refresh, setState } = useAppState("member");

  if (!state) {
    return <p className="p-6 text-muted-foreground">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="mx-auto grid h-full max-w-5xl gap-6 p-4 lg:grid-cols-2">
      <section className="space-y-4 py-2">
        <Link href="/" className="text-sm text-muted-foreground underline">
          Switch view
        </Link>
        <h1 className="text-3xl font-semibold">Hello, {state.member.name}</h1>
        <h2 className="text-lg text-muted-foreground">Today</h2>
        <TaskList tasks={state.tasks} role="member" large onChange={refresh} />
      </section>
      <section className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border lg:h-[calc(100vh-2rem)]">
        <ChatPanel
          role="member"
          large
          messages={state.messages}
          placeholder="Talk to me…"
          onState={setState}
        />
      </section>
    </div>
  );
}
