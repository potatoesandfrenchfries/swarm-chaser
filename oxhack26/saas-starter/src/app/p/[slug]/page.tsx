import Link from "next/link";
import { notFound } from "next/navigation";
import { UnlockButton } from "~/components/unlock-button";
import { checkAccess } from "~/lib/access";
import { prisma } from "~/lib/db";
import { paymentsEnabled } from "~/lib/env";
import { getCurrentUser } from "~/lib/session";

export const dynamic = "force-dynamic";

// The public share page. Everyone sees the summary; the notes go through
// checkAccess, so the gate is enforced on the server and the notes are never
// sent to a browser that has not paid.
export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findUnique({ where: { shareSlug: slug } });
  if (!project) notFound();

  const user = await getCurrentUser();
  const access = await checkAccess(project, user?.id);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">{project.name}</h1>
      {project.summary && <p className="text-lg text-muted-foreground">{project.summary}</p>}

      {access.allowed ? (
        <section className="space-y-2 rounded-2xl border p-5">
          <h2 className="font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap">{project.notes ?? "The owner has not added notes."}</p>
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border p-5">
          <h2 className="font-semibold">Notes are locked</h2>
          {access.reason === "unauthenticated" ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/" className="underline">
                Sign in
              </Link>{" "}
              to unlock them.
            </p>
          ) : paymentsEnabled() ? (
            <UnlockButton slug={slug} />
          ) : (
            <p className="text-sm text-muted-foreground">Payments are not set up on this deployment.</p>
          )}
        </section>
      )}
    </main>
  );
}
