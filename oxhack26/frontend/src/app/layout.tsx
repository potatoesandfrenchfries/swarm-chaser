import "~/styles/globals.css";
import "~/themes/railway/railway.css";

import type { Metadata } from "next";
import { Toaster } from "~/components/ui/sonner";
import { SITE } from "~/lib/constants/site";
import { theme } from "~/themes";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme={theme.name}
      className={`${theme.fontClassName} scroll-smooth`}
    >
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
