"use client";

import { useSyncExternalStore } from "react";
import { AGENTS, type AgentName } from "./config";

// Flue keeps the conversation itself (durable, replayed on reload). This
// store only remembers which conversations exist, for the sidebar. It lives in
// localStorage, so it is per browser: swap it for a server list to share it.
export interface ChatSession {
  id: string;
  agent: AgentName;
  /** First line of the first user message. */
  title: string;
  /** Pi model id the conversation was created with. */
  model?: string;
  createdAt: number;
}

const STORAGE_KEY = "agent-app-sessions";
const listeners = new Set<() => void>();
let cache: ChatSession[] | null = null;

function read(): ChatSession[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    cache = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    cache = [];
  }
  return cache ?? [];
}

function write(sessions: ChatSession[]) {
  cache = sessions;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage full or blocked: the in-memory list still works this visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: ChatSession[] = [];

export function useChatSessions(): ChatSession[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function saveSession(session: ChatSession) {
  write([session, ...read().filter((s) => s.id !== session.id)]);
}

export function removeSession(id: string) {
  write(read().filter((s) => s.id !== id));
}

export function newSessionId(agent: AgentName): string {
  return `${AGENTS[agent].prefix}-${crypto.randomUUID().slice(0, 13)}`;
}

/** Recover the agent from a session id, so a shared link opens the right one. */
export function agentFromId(id: string): AgentName {
  const found = (Object.keys(AGENTS) as AgentName[]).find((name) =>
    id.startsWith(`${AGENTS[name].prefix}-`)
  );
  return found ?? "assistant";
}

export function chatTitle(text: string): string {
  const line = text.trim().split("\n", 1)[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60).trimEnd()}…` : line || "New chat";
}
