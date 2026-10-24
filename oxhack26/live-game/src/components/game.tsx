"use client";

import usePartySocket from "partysocket/react";
import { useCallback, useEffect, useState } from "react";
import { PARTYKIT_HOST } from "~/lib/config";
import type { ClientMessage, RoomState, ServerMessage } from "~/shared/protocol";
import { EndedView } from "./ended-view";
import { LobbyView } from "./lobby-view";
import { QuestionView } from "./question-view";
import { RevealView } from "./reveal-view";

const ID_KEY = "live-game-id";

/** Stable per tab: a reload keeps your seat (and host), a second tab is a new player. */
function clientId() {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function Game({ room, name }: { room: string; name: string }) {
  // `at` is when the state arrived, to count the clock down from its remainingMs.
  const [snapshot, setSnapshot] = useState<{ state: RoomState; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [id] = useState(clientId);
  const [now, setNow] = useState(0);

  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    room,
    id,
    // Fires on every (re)connect, so a dropped connection rejoins by itself.
    onOpen() {
      setConnected(true);
      socket.send(JSON.stringify({ type: "join", name } satisfies ClientMessage));
    },
    onClose: () => setConnected(false),
    onMessage(event) {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "state") {
        const at = Date.now();
        setSnapshot({ state: message.state, at });
        setNow(at);
        setError(null);
      } else {
        setError(message.message);
      }
    },
  });

  const send = useCallback((message: ClientMessage) => socket.send(JSON.stringify(message)), [socket]);

  // A ticking clock for the countdown; only runs while a question is open.
  const open = snapshot?.state.phase === "question";
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [open]);

  if (!snapshot) {
    return <p className="p-6 text-muted-foreground">{connected ? "Joining…" : "Connecting…"}</p>;
  }

  const { state, at } = snapshot;
  const remainingMs = open ? Math.max(0, state.remainingMs - (now - at)) : 0;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-4 p-4">
      {!connected && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Connection lost. Reconnecting…
        </p>
      )}
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {state.phase === "lobby" && <LobbyView state={state} send={send} />}
      {state.phase === "question" && <QuestionView state={state} remainingMs={remainingMs} send={send} />}
      {state.phase === "reveal" && <RevealView state={state} send={send} />}
      {state.phase === "ended" && <EndedView state={state} send={send} />}
    </div>
  );
}
