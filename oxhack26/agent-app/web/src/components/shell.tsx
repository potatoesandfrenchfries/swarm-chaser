"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { APP } from "~/lib/config";
import { Sidebar } from "./sidebar";

/** Sidebar on desktop, a drawer on mobile. */
export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r bg-muted/40 md:block">
        <Sidebar onNavigate={() => setOpen(false)} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r bg-background">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 hover:bg-muted"
          >
            <Menu className="size-5" />
          </button>
          <span className="font-semibold">{APP.name}</span>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
