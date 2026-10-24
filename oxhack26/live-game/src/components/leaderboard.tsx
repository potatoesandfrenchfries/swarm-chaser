import type { PlayerView } from "~/shared/protocol";
import { cn } from "~/lib/utils";

export function Leaderboard({ players, youId }: { players: PlayerView[]; youId: string }) {
  if (players.length === 0) return <p className="text-sm text-muted-foreground">No players yet.</p>;
  return (
    <ol className="space-y-1.5">
      {players.map((p, i) => (
        <li
          key={p.id}
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm",
            p.id === youId && "border-accent",
            !p.connected && "opacity-50"
          )}
        >
          <span className="w-5 text-muted-foreground">{i + 1}</span>
          <span className="flex-1 truncate font-medium">{p.name}</span>
          <span className="tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
