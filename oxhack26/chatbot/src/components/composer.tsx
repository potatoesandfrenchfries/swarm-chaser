"use client";

import { ArrowUp, Square } from "lucide-react";
import { useState } from "react";
import { useChat } from "~/lib/store";

export function Composer({ disabled }: { disabled: boolean }) {
  const [text, setText] = useState("");
  const { send, stop, streamingId } = useChat();
  const busy = streamingId !== null;

  const submit = () => {
    if (!text.trim() || busy || disabled) return;
    void send(text);
    setText("");
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:border-accent">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter inserts a newline (and never mid-IME-composition).
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Message…"
          className="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none [field-sizing:content]"
        />
        {busy ? (
          <button
            onClick={stop}
            aria-label="Stop generating"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background"
          >
            <Square className="size-4 fill-current" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!text.trim() || disabled}
            aria-label="Send"
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground disabled:opacity-40"
          >
            <ArrowUp className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
