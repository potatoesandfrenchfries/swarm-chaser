import { theme } from "~/themes";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { Header, Footer } = theme;
  return (
    <main className={theme.shellClassName}>
      <Header />
      {children}
      <Footer />
    </main>
  );
}
