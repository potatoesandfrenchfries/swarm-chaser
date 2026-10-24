import type { ClientMessage, RoomState } from "~/shared/protocol";

export function LobbyView({ state, send }: { state: RoomState; send: (m: ClientMessage) => void }) {
  const { you, players, code } = state;
  return (
    <div className="space-y-6 py-8 text-center">
      <div>
        <p className="text-sm text-muted-foreground">Join with code</p>
        <p className="font-mono text-6xl font-bold tracking-widest">{code}</p>
      </div>

      <ul className="flex flex-wrap justify-center gap-2">
        {players.map((p) => (
          <li key={p.id} className="rounded-full border px-3 py-1 text-sm">
            {p.name}
          </li>
        ))}
        {players.length === 0 && <li className="text-sm text-muted-foreground">Waiting for players…</li>}
      </ul>

      {you.isHost ? (
        <button
          onClick={() => send({ type: "start" })}
          disabled={players.length === 0}
          className="rounded-xl bg-accent px-6 py-3 font-medium text-accent-foreground disabled:opacity-40"
        >
          Start game ({players.length} {players.length === 1 ? "player" : "players"})
        </button>
      ) : (
        <p className="text-muted-foreground">You&apos;re in, {you.name}. Waiting for the host to start…</p>
      )}
    </div>
  );
}
