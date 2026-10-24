"use client";

import { useFlueAgent } from "@flue/react";
import { createFlueClient } from "@flue/sdk";
import { useEffect, useRef } from "react";
import { agentUrl } from "~/lib/config";
import { modelName } from "~/lib/models";
import {
  agentFromId,
  chatTitle,
  saveSession,
  useChatSessions,
} from "~/lib/sessions";
import { cn } from "~/lib/utils";
import { Composer } from "./composer";
import { Message } from "./message";

export function ChatWorkspace({
  sessionId,
  firstMessage,
  model,
}: {
  sessionId: string;
  /** Sent once on open, when the chat was started from the home page. */
  firstMessage?: string;
  model?: string;
}) {
  const agentName = agentFromId(sessionId);
  const url = agentUrl(agentName, sessionId);
  const agent = useFlueAgent({ url });
  const sessions = useChatSessions();
  const session = sessions.find((s) => s.id === sessionId);

  const working = agent.status === "submitted" || agent.status === "streaming";
  const sent = useRef(false);

  // The creating send is the only one that may carry initialData. Only the
  // assistant declares a schema for it, so the researcher is sent without.
  const send = (text: string, creating: boolean) => {
    const initialData =
      creating && agentName === "assistant" && model ? { model } : undefined;
    void agent.sendMessage(text, initialData ? { initialData } : undefined);
  };

  // Start the conversation from the home page's prompt, exactly once.
  useEffect(() => {
    if (!firstMessage || sent.current || !agent.historyReady) return;
    sent.current = true;
    if (agent.messages.length === 0) send(firstMessage, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstMessage, agent.historyReady]);

  // Sidebar entry: created on first sight, so opening a shared link adds it.
  useEffect(() => {
    if (session || !agent.historyReady) return;
    const first = agent.messages.find((m) => m.role === "user");
    const text = first?.parts.find((p) => p.type === "text")?.text ?? firstMessage;
    if (!text) return;
    saveSession({
      id: sessionId,
      agent: agentName,
      title: chatTitle(text),
      model,
      createdAt: Date.now(),
    });
  }, [session, agent.historyReady, agent.messages, firstMessage, model, sessionId, agentName]);

  // Keep the newest content in view while a reply streams.
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [agent.messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {session?.title ?? "Conversation"}
        </h1>
        <span className="text-xs text-muted-foreground">
          {modelName(session?.model ?? model)}
        </span>
        <span
          className={cn(
            "size-2 rounded-full",
            working && "animate-pulse bg-amber-500",
            agent.status === "idle" && "bg-emerald-500",
            agent.status === "error" && "bg-destructive"
          )}
        />
      </header>

      {agent.error && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {agent.error.message}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {agent.messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
          <div ref={bottom} />
        </div>
      </div>

      <Composer
        busy={working}
        disabled={!agent.historyReady}
        onSend={(text) => send(text, agent.messages.length === 0)}
        // Relative URLs only resolve in the browser, so the client is made on click.
        onStop={() => void createFlueClient({ url }).abort()}
      />
    </div>
  );
}
