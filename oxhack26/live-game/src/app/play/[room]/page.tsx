import { Game } from "~/components/game";
import { normaliseRoomCode } from "~/lib/config";

export default async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ room: string }>;
  searchParams: Promise<{ name?: string; host?: string }>;
}) {
  const { room } = await params;
  const { name, host } = await searchParams;

  // The server decides who hosts (first to connect), so a host just joins under
  // a placeholder name that is never shown.
  const displayName = host === "1" ? "Host" : (name ?? "").trim() || "Player";
  return <Game room={normaliseRoomCode(room)} name={displayName} />;
}
