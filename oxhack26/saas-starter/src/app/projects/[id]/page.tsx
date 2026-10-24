import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteProject } from "~/components/delete-project";
import { prisma } from "~/lib/db";
import { getEnv } from "~/lib/env";
import { getCurrentUser } from "~/lib/session";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, ownerId: user.id } });
  if (!project) notFound();

  const shareUrl = `${getEnv().NEXTAUTH_URL}/p/${project.shareSlug}`;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <Link href="/dashboard" className="text-sm text-muted-foreground underline">
        All projects
      </Link>
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      {project.summary && <p className="text-muted-foreground">{project.summary}</p>}

      <section className="space-y-1">
        <h2 className="font-semibold">Share link</h2>
        <p className="break-all rounded-xl border bg-muted px-3 py-2 font-mono text-sm">{shareUrl}</p>
        <p className="text-sm text-muted-foreground">Anyone with it sees the summary; the notes are behind the paywall.</p>
      </section>

      <section className="space-y-1">
        <h2 className="font-semibold">Notes</h2>
        <p className="whitespace-pre-wrap">{project.notes ?? "No notes yet."}</p>
      </section>

      <DeleteProject id={project.id} />
    </main>
  );
}
