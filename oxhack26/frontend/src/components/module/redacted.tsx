/** Black bar over text. Use for perks / announcements that aren't public yet. */
export function Redacted({ children }: { children: React.ReactNode }) {
  return (
    <span aria-label="redacted" className="inline-block w-fit align-middle">
      <span className="select-none bg-foreground text-foreground">
        {children}
      </span>
    </span>
  );
}
