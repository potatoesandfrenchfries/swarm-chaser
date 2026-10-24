import Dexie, { type EntityTable } from "dexie";
import { DEFAULT_SETTINGS } from "./config";
import type { Conversation, Settings } from "./types";

/**
 * Everything lives in the browser's IndexedDB: no accounts, no server.
 *
 * API keys go in a separate database so that a future export/backup feature
 * (which would read `chatbot`) cannot include them by accident. Keys are stored
 * per provider preset, so switching provider never sends one provider's key to
 * another's host. Pattern borrowed from Dialogia (`dialogia-keys`).
 */
const db = new Dexie("chatbot") as Dexie & {
  conversations: EntityTable<Conversation, "id">;
  settings: EntityTable<
    { key: string; value: Omit<Settings, "apiKey"> },
    "key"
  >;
};

db.version(1).stores({
  conversations: "id, updatedAt",
  settings: "key",
});

const keyDb = new Dexie("chatbot-keys") as Dexie & {
  keys: EntityTable<{ presetId: string; apiKey: string }, "presetId">;
};

keyDb.version(1).stores({ keys: "presetId" });

export async function loadAll() {
  const [conversations, saved, keyRows] = await Promise.all([
    db.conversations.orderBy("updatedAt").reverse().toArray(),
    db.settings.get("settings"),
    keyDb.keys.toArray(),
  ]);
  const keys = Object.fromEntries(keyRows.map((r) => [r.presetId, r.apiKey]));
  const base = { ...DEFAULT_SETTINGS, ...saved?.value };
  return {
    conversations,
    keys,
    settings: { ...base, apiKey: keys[base.presetId] ?? "" },
  };
}

export const saveConversation = (c: Conversation) => db.conversations.put(c);
export const removeConversation = (id: string) => db.conversations.delete(id);

/** Saves everything except the API key, which goes to the keys database. */
export const saveSettings = (settings: Settings) => {
  const value: Partial<Settings> = { ...settings };
  delete value.apiKey;
  return db.settings.put({
    key: "settings",
    value: value as Omit<Settings, "apiKey">,
  });
};

export const saveKey = (presetId: string, apiKey: string) =>
  keyDb.keys.put({ presetId, apiKey });
