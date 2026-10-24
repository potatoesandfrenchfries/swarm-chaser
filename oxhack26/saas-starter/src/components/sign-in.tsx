"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignIn({ providers }: { providers: { google: boolean; demo: boolean } }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function demo(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("demo", { email, name, redirect: false });
    setBusy(false);
    if (res?.error || !res?.ok) return setError("Could not sign in. Check the email and try again.");
    router.push("/dashboard");
    router.refresh();
  }

  const field = "w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent";
  return (
    <div className="space-y-4">
      {providers.google && (
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="w-full rounded-xl border px-4 py-2.5 text-sm font-medium hover:bg-muted"
        >
          Continue with Google
        </button>
      )}
      {providers.demo && (
        <form onSubmit={demo} className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Demo sign-in: no password. Use any email; do not use real data.
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={field} />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={field}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
