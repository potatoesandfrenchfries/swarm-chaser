import { TriangleAlert } from "lucide-react";
import type { ChatMessage } from "~/lib/types";
import { cn } from "~/lib/utils";
import { Markdown } from "./markdown";

export function Message({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser && "justify-end")}>
      <div
        className={cn(
          "max-w-[85%]",
          isUser && "rounded-2xl bg-muted px-4 py-2.5"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {message.content}
          </p>
        ) : message.content ? (
          <Markdown streaming={streaming}>{message.content}</Markdown>
        ) : streaming ? (
          <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-muted-foreground" />
        ) : null}
        {message.error && (
          <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="break-words">{message.error}</span>
          </p>
        )}
      </div>
    </div>
  );
}
