/** Empty / placeholder state for a dashboard tab. */
export function Panel({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="p-8 md:p-10 lg:p-12">
      <h2 className="font-heading text-xl font-bold">{title}</h2>
      <div className="mt-2 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}
