import { cn } from "~/lib/utils";
import { theme } from "~/themes";

/**
 * Shell for signed-in pages (register / status / dashboard): the theme's header
 * plus a content wrapper that clears it (`theme.mainClassName`).
 *
 * Put auth guards here or in each page, e.g.
 *   const session = await getSession(); if (!session) redirect("/");
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { Header } = theme;
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className={cn("flex w-full flex-1 flex-col", theme.mainClassName)}>
        {children}
      </main>
    </div>
  );
}
