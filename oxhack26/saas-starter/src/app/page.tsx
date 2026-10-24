import { redirect } from "next/navigation";
import { SignIn } from "~/components/sign-in";
import { getEnv } from "~/lib/env";
import { getCurrentUser } from "~/lib/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await getCurrentUser()) redirect("/dashboard");

  const env = getEnv();
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  // Mirrors auth.ts: demo sign-in is on when asked for, or when nothing else exists.
  const demo = env.ALLOW_DEMO_LOGIN === "true" || !google;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-8 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">SaaS starter</h1>
        <p className="mt-2 text-muted-foreground">
          Create projects, share them by link, and let other people pay to unlock the notes.
        </p>
      </div>
      <SignIn providers={{ google, demo }} />
    </main>
  );
}
