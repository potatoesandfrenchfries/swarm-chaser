import { create } from "zustand";
import { DEFAULT_SETTINGS } from "./config";
import * as db from "./db";
import { streamChat } from "./providers";
import { createStreamAccumulator } from "./vendor/stream-accumulator";
import type { ChatMessage, Conversation, Settings } from "./types";
import { uid } from "./utils";

interface State {
  ready: boolean;
  conversations: Conversation[];
  activeId: string | null;
  settings: Settings;
  /** Id of the assistant message currently streaming, if any. */
  streamingId: string | null;
  /** API key per provider preset; `settings.apiKey` is the active one. */
  keys: Record<string, string>;

  init: () => Promise<void>;
  newChat: () => void;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

let controller: AbortController | null = null;

/** Minimum gap between checkpoint writes of a streaming reply. */
const CHECKPOINT_MS = 1000;

export const useChat = create<State>((set, get) => {
  /** Immutably updates one conversation. */
  const patch = (id: string, fn: (c: Conversation) => Conversation) =>
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === id ? fn(c) : c)),
    }));

  const patchMessage = (
    convId: string,
    msgId: string,
    fn: (m: ChatMessage) => ChatMessage
  ) =>
    patch(convId, (c) => ({
      ...c,
      messages: c.messages.map((m) => (m.id === msgId ? fn(m) : m)),
    }));

  const persist = (id: string) => {
    const c = get().conversations.find((c) => c.id === id);
    if (c) void db.saveConversation(c);
  };

  return {
    ready: false,
    conversations: [],
    activeId: null,
    settings: DEFAULT_SETTINGS,
    streamingId: null,
    keys: {},

    async init() {
      if (get().ready) return;
      const { conversations: loaded, settings, keys } = await db.loadAll();
      // A reply still flagged `streaming` was cut off by a reload or crash.
      // Keep the text that was checkpointed and say it is incomplete.
      const conversations = loaded.map((c) =>
        c.messages.some((m) => m.streaming)
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.streaming
                  ? { ...m, streaming: false, error: "Interrupted" }
                  : m
              ),
            }
          : c
      );
      conversations.forEach((c, i) => {
        if (c !== loaded[i]) void db.saveConversation(c);
      });
      set({ conversations, settings, keys, ready: true });
    },

    newChat() {
      get().stop();
      set({ activeId: null });
    },

    selectChat(id) {
      get().stop();
      set({ activeId: id });
    },

    deleteChat(id) {
      if (get().activeId === id) get().stop();
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      }));
      void db.removeConversation(id);
    },

    updateSettings(next) {
      const prev = get().settings;
      const keys = { ...get().keys };
      const settings = { ...prev, ...next };
      if (next.apiKey !== undefined) {
        keys[settings.presetId] = next.apiKey;
        void db.saveKey(settings.presetId, next.apiKey);
      } else if (next.presetId && next.presetId !== prev.presetId) {
        // Switching provider switches key, so a key never goes to the wrong host.
        settings.apiKey = keys[next.presetId] ?? "";
      }
      set({ settings, keys });
      void db.saveSettings(settings);
    },

    stop() {
      controller?.abort();
    },

    async send(text) {
      const content = text.trim();
      if (!content || get().streamingId) return;

      const now = Date.now();
      let convId = get().activeId;
      if (!convId) {
        convId = uid();
        const conv: Conversation = {
          id: convId,
          title: content.slice(0, 48),
          messages: [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          conversations: [conv, ...s.conversations],
          activeId: conv.id,
        }));
      }

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content,
        createdAt: now,
      };
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "",
        createdAt: now,
        streaming: true,
      };
      patch(convId, (c) => ({
        ...c,
        updatedAt: now,
        messages: [...c.messages, userMsg, reply],
      }));
      set({ streamingId: reply.id });

      // History sent to the model: everything before the empty reply, minus failed turns.
      const history = get()
        .conversations.find((c) => c.id === convId)!
        .messages.filter((m) => m.id !== reply.id && !m.error && m.content)
        .map(({ role, content }) => ({ role, content }));

      // Tokens are batched (~32ms) so a long reply doesn't re-render per token,
      // and the partial reply is checkpointed so a reload doesn't lose it.
      let lastCheckpoint = Date.now();
      const acc = createStreamAccumulator((text) => {
        patchMessage(convId, reply.id, (m) => ({
          ...m,
          content: m.content + text,
        }));
        if (Date.now() - lastCheckpoint >= CHECKPOINT_MS) {
          lastCheckpoint = Date.now();
          persist(convId);
        }
      });

      controller = new AbortController();
      try {
        await streamChat({
          settings: get().settings,
          messages: history,
          signal: controller.signal,
          onToken: acc.push,
        });
      } catch (err) {
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        patchMessage(convId, reply.id, (m) => ({
          ...m,
          error: aborted
            ? "Stopped"
            : err instanceof Error
              ? err.message
              : String(err),
        }));
      } finally {
        acc.flush();
        patchMessage(convId, reply.id, (m) => ({ ...m, streaming: false }));
        controller = null;
        set({ streamingId: null });
        persist(convId);
      }
    },
  };
});
