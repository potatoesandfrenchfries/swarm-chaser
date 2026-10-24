import Link from "next/link";

// Landing page after Stripe Checkout. It grants nothing: access arrives via the
// webhook, which can lag the redirect by a moment, so the link may need a refresh.
export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Payment received</h1>
      <p className="text-muted-foreground">
        Your unlock is confirmed as soon as Stripe notifies us, usually within seconds. If the notes are still
        locked, refresh the page.
      </p>
      {slug && (
        <Link href={`/p/${slug}`} className="inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground">
          Back to the project
        </Link>
      )}
    </main>
  );
}
