import type { Metadata, Viewport } from "next";
import { APP } from "~/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: APP.name,
  description: APP.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
