import Link from "next/link";

import { Button } from "~/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="font-display text-7xl font-bold leading-none sm:text-8xl md:text-9xl">
          404
        </span>
        <h1 className="font-heading text-xl font-medium sm:text-2xl">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Button asChild size="lg">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </main>
  );
}
