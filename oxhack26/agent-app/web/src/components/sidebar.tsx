"use client";

import { MessageSquarePlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { APP } from "~/lib/config";
import { removeSession, useChatSessions } from "~/lib/sessions";
import { cn } from "~/lib/utils";

export function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const sessions = useChatSessions();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="font-semibold">{APP.name}</span>
        <Link
          href="/"
          onClick={onNavigate}
          aria-label="New chat"
          className="rounded-md p-1.5 hover:bg-muted"
        >
          <MessageSquarePlus className="size-5" />
        </Link>
      </div>

      <nav className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group flex items-center rounded-lg hover:bg-muted",
              pathname === `/chat/${s.id}` && "bg-muted"
            )}
          >
            <Link
              href={`/chat/${s.id}`}
              onClick={onNavigate}
              className="min-w-0 flex-1 truncate px-3 py-2 text-sm"
            >
              {s.title}
            </Link>
            <button
              onClick={() => {
                removeSession(s.id);
                if (pathname === `/chat/${s.id}`) router.push("/");
              }}
              aria-label={`Remove ${s.title}`}
              className="mr-1 rounded-md p-1.5 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </nav>
    </div>
  );
}
