import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "~/components/ui/button";

export const metadata: Metadata = { title: "Registration closed" };

export default function RegistrationClosedPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center px-4">
      <div className="flex flex-col items-center text-center">
        <h1 className="font-display text-3xl font-bold sm:text-4xl md:text-5xl">
          Registration is Closed
        </h1>
        <p className="mt-4 max-w-lg text-muted-foreground">
          Unfortunately registration is closed for this event. Follow us on
          social media to hear about the next one.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/">Back home</Link>
        </Button>
      </div>
    </div>
  );
}
