import type { Metadata } from "next";
import Link from "next/link";

import { LogoMark } from "~/components/brand/logo-mark";
import { Button } from "~/components/ui/button";
import { SITE } from "~/lib/constants/site";

export const metadata: Metadata = { title: "Registration status" };

type Status = "pending" | "confirmed" | "declined";

const COPY: Record<Status, { title: string; lines: string[] }> = {
  pending: {
    title: "Registration received",
    lines: [
      "We're confirming your place.",
      "You can update your details until registration closes.",
    ],
  },
  confirmed: {
    title: "You're in!",
    lines: ["Your place is confirmed.", "Check your email for next steps."],
  },
  declined: {
    title: "Registration update",
    lines: [
      "Unfortunately we can't offer you a place this time.",
      "We hope to see you at a future event.",
    ],
  },
};

const isStatus = (v: string | undefined): v is Status => !!v && v in COPY;

/**
 * Preview any state with ?state=confirmed or ?state=declined. Replace `status`
 * with a lookup of the signed-in user's registration.
 */
export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const status: Status = isStatus(state) ? state : "pending";
  const copy = COPY[status];

  return (
    <div className="flex min-h-[70vh] items-center py-12 md:py-16">
      <div className="w-full border-y bg-background p-4 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogoMark className="size-12 sm:size-16 2xl:size-16" />
          <div>
            <p className="label text-muted-foreground">Registration status</p>
            <h1 className="font-heading text-xl font-bold sm:text-2xl">
              {copy.title}
            </h1>
          </div>
        </div>

        <div className="mb-5 space-y-2 text-sm text-muted-foreground">
          {copy.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <div className="mt-20 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {SITE.name} · {SITE.dates}
          </p>
          {status === "confirmed" ? (
            <Button asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/register">Edit registration</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
