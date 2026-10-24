"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AGENTS, APP, type AgentName } from "~/lib/config";
import { DEFAULT_MODEL, MODELS } from "~/lib/models";
import { newSessionId } from "~/lib/sessions";
import { Composer } from "./composer";

export function NewChat() {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentName>("assistant");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);

  // The first message rides in the URL so the conversation page can send it
  // with initialData (the model), which only the creating send may carry.
  const start = (text: string) => {
    const id = newSessionId(agent);
    const params = new URLSearchParams({ q: text, model });
    router.push(`/chat/${id}?${params}`);
  };

  const select = "rounded-lg border bg-background px-2 py-1.5 text-sm";
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 pb-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{APP.name}</h1>
        <p className="mt-1 text-muted-foreground">{APP.tagline}</p>
      </div>
      <div className="mx-auto flex gap-2">
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value as AgentName)}
          className={select}
          aria-label="Agent"
        >
          {(Object.keys(AGENTS) as AgentName[]).map((name) => (
            <option key={name} value={name}>
              {AGENTS[name].label}
            </option>
          ))}
        </select>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={select}
          aria-label="Model"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <Composer busy={false} onSend={start} placeholder="Ask anything…" />
    </div>
  );
}
