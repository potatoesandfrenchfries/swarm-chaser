import Link from "next/link";
import { redirect } from "next/navigation";
import { ProjectForm } from "~/components/project-form";
import { SignOut } from "~/components/sign-out";
import { prisma } from "~/lib/db";
import { getCurrentUser } from "~/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { unlocks: { where: { status: "paid" } } } } },
  });

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{user.email}</span>
          <SignOut />
        </div>
      </header>

      <ProjectForm />

      <ul className="divide-y rounded-2xl border">
        {projects.length === 0 && <li className="p-4 text-sm text-muted-foreground">No projects yet.</li>}
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-muted">
              <span className="truncate font-medium">{p.name}</span>
              <span className="shrink-0 text-sm text-muted-foreground">{p._count.unlocks} unlocked</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
