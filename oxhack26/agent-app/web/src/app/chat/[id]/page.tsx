import { ChatWorkspace } from "~/components/chat-workspace";
import { Shell } from "~/components/shell";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; model?: string }>;
}) {
  const { id } = await params;
  const { q, model } = await searchParams;
  return (
    <Shell>
      <ChatWorkspace sessionId={id} firstMessage={q} model={model} />
    </Shell>
  );
}
