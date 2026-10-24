"use client";

import { KeyRound, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { APP, getPreset } from "~/lib/config";
import { useChat } from "~/lib/store";
import { cn } from "~/lib/utils";
import { Composer } from "./composer";
import { Message } from "./message";
import { SettingsDialog } from "./settings-dialog";
import { Sidebar } from "./sidebar";

export function ChatApp() {
  const { ready, init, conversations, activeId, settings, streamingId, send } =
    useChat();
  const [drawer, setDrawer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void init();
  }, [init]);

  const active = conversations.find((c) => c.id === activeId);
  const messages = active?.messages ?? [];
  const lastLength = messages.at(-1)?.content.length;

  // Follow the stream as tokens arrive.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastLength]);

  if (!ready) return null;

  const needsSetup =
    !settings.baseUrl ||
    !settings.model ||
    (getPreset(settings.presetId).needsKey && !settings.apiKey);

  return (
    <div className="flex h-dvh">
      {/* Sidebar: static on desktop, drawer on mobile. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 border-r bg-background transition-transform md:static md:translate-x-0",
          !drawer && "-translate-x-full"
        )}
      >
        <Sidebar
          onOpenSettings={() => {
            setShowSettings(true);
            setDrawer(false);
          }}
          onNavigate={() => setDrawer(false)}
        />
      </aside>
      {drawer && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setDrawer(false)}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <button
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <span className="truncate text-sm font-medium">
            {active?.title || APP.name}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-6">
            {messages.length === 0 ? (
              <div className="m-auto space-y-6 text-center">
                <div>
                  <h1 className="text-2xl font-semibold">{APP.name}</h1>
                  <p className="mt-1 text-muted-foreground">{APP.tagline}</p>
                </div>
                {needsSetup ? (
                  <button
                    onClick={() => setShowSettings(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                  >
                    <KeyRound className="size-4" /> Connect a provider
                  </button>
                ) : (
                  <div className="flex flex-wrap justify-center gap-2">
                    {APP.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => void send(s)}
                        className="rounded-xl border px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map((m) => (
                <Message
                  key={m.id}
                  message={m}
                  streaming={m.id === streamingId}
                />
              ))
            )}
            <div ref={endRef} />
          </div>
        </div>

        <Composer disabled={needsSetup} />
      </main>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
