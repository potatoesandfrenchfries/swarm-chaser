import type { ClientMessage, RoomState } from "~/shared/protocol";
import { cn } from "~/lib/utils";

const OPTION_COLOURS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500"];

export function QuestionView({
  state,
  remainingMs,
  send,
}: {
  state: RoomState;
  remainingMs: number;
  send: (m: ClientMessage) => void;
}) {
  const { question, you, players } = state;
  if (!question) return null;

  const answered = players.filter((p) => p.answered).length;
  const chosen = you.choice !== null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Question {question.index + 1} of {question.total}
        </span>
        <span>
          {answered}/{players.length} answered
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${Math.min(100, (remainingMs / (question.seconds * 1000)) * 100)}%` }}
        />
      </div>

      <h1 className="text-2xl font-semibold">{question.prompt}</h1>
      {question.code && (
        <pre className="overflow-x-auto rounded-xl border bg-muted p-4 font-mono text-sm">{question.code}</pre>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {question.options.map((option, i) => (
          <button
            key={i}
            disabled={you.isHost || chosen}
            onClick={() => send({ type: "answer", choice: i })}
            className={cn(
              "rounded-xl px-4 py-5 text-left text-lg font-medium text-white transition",
              OPTION_COLOURS[i % OPTION_COLOURS.length],
              (you.isHost || chosen) && you.choice !== i && "opacity-40",
              you.choice === i && "ring-4 ring-foreground/40"
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {chosen && <p className="text-center text-muted-foreground">Locked in. Waiting for the others…</p>}
      {you.isHost && (
        <div className="text-center">
          <button onClick={() => send({ type: "reveal" })} className="rounded-xl border px-4 py-2 text-sm hover:bg-muted">
            Reveal now
          </button>
        </div>
      )}
    </div>
  );
}
