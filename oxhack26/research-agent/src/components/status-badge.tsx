import type { RunStatus } from "~/lib/research/schemas";
import { cn } from "~/lib/utils";

export function StatusBadge({ status }: { status: RunStatus }) {
  const working = status !== "queued" && status !== "completed" && status !== "failed";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-xs",
        working && "animate-pulse border-amber-500 text-amber-600",
        status === "completed" && "border-emerald-500 text-emerald-600",
        status === "failed" && "border-destructive text-destructive"
      )}
    >
      {status}
    </span>
  );
}
