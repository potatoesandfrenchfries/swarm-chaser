"use client";

import { MessageSquarePlus, Settings, Trash2 } from "lucide-react";
import { APP } from "~/lib/config";
import { useChat } from "~/lib/store";
import { cn } from "~/lib/utils";

export function Sidebar({
  onOpenSettings,
  onNavigate,
}: {
  onOpenSettings: () => void;
  /** Called after a selection so the mobile drawer can close. */
  onNavigate: () => void;
}) {
  const { conversations, activeId, newChat, selectChat, deleteChat } =
    useChat();

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-semibold">{APP.name}</span>
        <button
          onClick={() => {
            newChat();
            onNavigate();
          }}
          aria-label="New chat"
          className="rounded-md p-1.5 hover:bg-muted"
        >
          <MessageSquarePlus className="size-5" />
        </button>
      </div>

      <nav className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center rounded-lg hover:bg-muted",
              c.id === activeId && "bg-muted"
            )}
          >
            <button
              onClick={() => {
                selectChat(c.id);
                onNavigate();
              }}
              className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
            >
              {c.title || "New chat"}
            </button>
            <button
              onClick={() => deleteChat(c.id)}
              aria-label={`Delete ${c.title}`}
              className="mr-1 rounded-md p-1.5 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </nav>

      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Settings className="size-4" /> Settings
      </button>
    </div>
  );
}
