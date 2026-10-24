import type { ClientMessage, RoomState } from "~/shared/protocol";
import { Leaderboard } from "./leaderboard";

export function EndedView({ state, send }: { state: RoomState; send: (m: ClientMessage) => void }) {
  const { players, you } = state;
  const winner = players[0];
  const rank = players.findIndex((p) => p.id === you.id) + 1;

  return (
    <div className="space-y-6 py-6">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Game over</p>
        <h1 className="text-3xl font-semibold">{winner ? `${winner.name} wins` : "No players"}</h1>
        {!you.isHost && rank > 0 && <p className="mt-1 text-muted-foreground">You finished #{rank}</p>}
      </div>
      <Leaderboard players={players} youId={you.id} />
      {you.isHost && (
        <button
          onClick={() => send({ type: "restart" })}
          className="w-full rounded-xl border px-6 py-3 font-medium hover:bg-muted"
        >
          Play again with the same players
        </button>
      )}
    </div>
  );
}
