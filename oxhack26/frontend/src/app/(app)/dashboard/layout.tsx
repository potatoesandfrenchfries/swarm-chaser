import { theme } from "~/themes";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { Footer } = theme;
  return (
    <>
      {children}
      {/* The footer is full-bleed, so pull it back out of the main inset. */}
      <div className={theme.bleedClassName}>
        <Footer />
      </div>
    </>
  );
}
