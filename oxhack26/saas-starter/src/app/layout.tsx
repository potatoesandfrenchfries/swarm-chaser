import type { Metadata, Viewport } from "next";
import { Providers } from "~/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS starter",
  description: "Sign-in, a database, one-off payments and sane defaults.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
