"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { newRoomCode, normaliseRoomCode } from "~/lib/config";

export default function Page() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const field = "w-full rounded-xl border bg-background px-3 py-3 outline-none focus:border-accent";
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">Live game</h1>
        <p className="mt-1 text-muted-foreground">A host runs the questions; everyone else answers on their own screen.</p>
      </div>

      <button
        onClick={() => router.push(`/play/${newRoomCode()}?host=1`)}
        className="rounded-xl bg-accent px-6 py-4 font-medium text-accent-foreground"
      >
        Host a game
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const room = normaliseRoomCode(code);
          if (room && name.trim()) router.push(`/play/${room}?name=${encodeURIComponent(name.trim())}`);
        }}
        className="space-y-3"
      >
        <h2 className="font-semibold">Join a game</h2>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Room code"
          autoCapitalize="characters"
          className={`${field} font-mono uppercase tracking-widest`}
        />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={20} className={field} />
        <button
          disabled={!normaliseRoomCode(code) || !name.trim()}
          className="w-full rounded-xl border px-6 py-3 font-medium hover:bg-muted disabled:opacity-40"
        >
          Join
        </button>
      </form>
    </main>
  );
}
