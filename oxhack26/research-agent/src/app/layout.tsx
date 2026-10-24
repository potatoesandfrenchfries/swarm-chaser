import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research agent",
  description: "Staged research runs with cited, verified findings.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b">
          <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/research" className="font-semibold">
              Research agent
            </Link>
            <Link href="/research" className="text-muted-foreground hover:text-foreground">
              Runs
            </Link>
            <Link href="/documents" className="text-muted-foreground hover:text-foreground">
              Documents
            </Link>
          </nav>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
