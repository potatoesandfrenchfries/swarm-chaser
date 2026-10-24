"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AppState, Message, Role } from "~/lib/types";
import { cn } from "~/lib/utils";

export function ChatPanel({
  role,
  messages,
  large = false,
  placeholder,
  onState,
}: {
  role: Role;
  messages: Message[];
  /** Bigger type for the member view. */
  large?: boolean;
  placeholder?: string;
  onState: (state: AppState) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = text.trim();
    if (!input || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onState(body.state);
    } catch (e) {
      setText(input);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-muted-foreground">Say hello to get started.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" && "justify-end")}>
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5",
                large ? "text-lg leading-relaxed" : "text-[15px]",
                m.role === "user" ? "bg-accent text-accent-foreground" : "bg-muted"
              )}
            >
              {m.text}
            </p>
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Thinking…</p>}
        <div ref={bottom} />
      </div>

      {error && <p className="px-4 pb-1 text-sm text-destructive">{error}</p>}
      <form onSubmit={submit} className="flex gap-2 border-t p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? "Type a message…"}
          className={cn(
            "min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 outline-none focus:border-accent",
            large && "text-lg"
          )}
        />
        <button
          disabled={busy || !text.trim()}
          aria-label="Send"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground disabled:opacity-40"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
    </div>
  );
}
