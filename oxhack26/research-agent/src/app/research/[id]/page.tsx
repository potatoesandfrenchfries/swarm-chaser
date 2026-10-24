import { RunView } from "~/components/run-view";

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { id } = await params;
  const { start } = await searchParams;
  return <RunView runId={id} autoStart={start === "1"} />;
}
