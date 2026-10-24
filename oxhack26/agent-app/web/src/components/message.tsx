import type { FlueConversationMessage, FlueConversationPart } from "@flue/react";
import { Brain, Check, Loader2, TriangleAlert, Wrench } from "lucide-react";
import { cn } from "~/lib/utils";
import { Markdown } from "./markdown";

type ToolPart = Extract<FlueConversationPart, { type: "dynamic-tool" }>;

function ToolCall({ part }: { part: ToolPart }) {
  const running = part.state === "input-available";
  const failed = part.state === "output-error";
  return (
    <details className="rounded-lg border bg-muted/50 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
        <Wrench className="size-4 text-muted-foreground" />
        <span className="font-mono text-[13px]">{part.toolName}</span>
        <span className="ml-auto">
          {running ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : failed ? (
            <TriangleAlert className="size-4 text-destructive" />
          ) : (
            <Check className="size-4 text-muted-foreground" />
          )}
        </span>
      </summary>
      <pre className="overflow-x-auto border-t px-3 py-2 text-xs">
        {JSON.stringify(
          { input: part.input, output: part.output, error: part.errorText },
          null,
          2
        )}
      </pre>
    </details>
  );
}

function Part({ part }: { part: FlueConversationPart }) {
  switch (part.type) {
    case "text":
      return part.text ? <Markdown>{part.text}</Markdown> : null;
    case "reasoning":
      return part.text ? (
        <details className="text-sm text-muted-foreground">
          <summary className="flex cursor-pointer list-none items-center gap-1.5">
            <Brain className="size-4" /> Reasoning
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{part.text}</p>
        </details>
      ) : null;
    case "dynamic-tool":
      return <ToolCall part={part} />;
    default:
      // data-* and file parts: render them here when an agent starts emitting them.
      return null;
  }
}

export function Message({ message }: { message: FlueConversationMessage }) {
  if (message.display !== "visible") return null;

  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser && "justify-end")}>
      <div
        className={cn(
          "min-w-0 max-w-[85%] space-y-3",
          isUser && "rounded-2xl bg-muted px-4 py-2.5"
        )}
      >
        {message.parts.map((part, i) => (
          <Part key={i} part={part} />
        ))}
      </div>
    </div>
  );
}
