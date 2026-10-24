import type { ClientMessage, RoomState } from "~/shared/protocol";
import { cn } from "~/lib/utils";
import { Leaderboard } from "./leaderboard";

export function RevealView({ state, send }: { state: RoomState; send: (m: ClientMessage) => void }) {
  const { question, reveal, you, players } = state;
  if (!question || !reveal) return null;

  const isLast = question.index + 1 >= question.total;
  const correct = you.choice === reveal.answer;
  const max = Math.max(1, ...reveal.counts);

  return (
    <div className="space-y-6">
      {!you.isHost && (
        <div className={cn("rounded-2xl p-5 text-center", correct ? "bg-emerald-500/15" : "bg-rose-500/15")}>
          <p className="text-2xl font-semibold">
            {you.choice === null ? "Out of time" : correct ? "Correct!" : "Not quite"}
          </p>
          {you.gained ? <p className="mt-1 text-muted-foreground">+{you.gained} points</p> : null}
        </div>
      )}

      <div>
        <h1 className="text-xl font-semibold">{question.prompt}</h1>
        <ul className="mt-3 space-y-2">
          {question.options.map((option, i) => (
            <li
              key={i}
              className={cn(
                "relative overflow-hidden rounded-xl border px-3 py-2 text-sm",
                i === reveal.answer && "border-emerald-500"
              )}
            >
              <span
                className={cn("absolute inset-y-0 left-0", i === reveal.answer ? "bg-emerald-500/20" : "bg-muted")}
                style={{ width: `${(reveal.counts[i]! / max) * 100}%` }}
              />
              <span className="relative flex justify-between gap-3">
                <span>
                  {option}
                  {i === you.choice ? " (you)" : ""}
                </span>
                <span className="tabular-nums text-muted-foreground">{reveal.counts[i]}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">{reveal.explanation}</p>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Leaderboard</h2>
        <Leaderboard players={players} youId={you.id} />
      </section>

      {you.isHost ? (
        <button
          onClick={() => send({ type: "next" })}
          className="w-full rounded-xl bg-accent px-6 py-3 font-medium text-accent-foreground"
        >
          {isLast ? "Final results" : "Next question"}
        </button>
      ) : (
        <p className="text-center text-muted-foreground">Waiting for the host…</p>
      )}
    </div>
  );
}
