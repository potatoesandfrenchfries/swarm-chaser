import { BulletLabel } from "../bullet-label";

export type InfoItem = { label: string; value?: React.ReactNode };

/**
 * A bordered block: bullet title on the left, label/value rows on the right.
 * Empty values render an em dash. Stack several inside `divide-y` for a
 * profile-style page.
 */
export function InfoSection({
  title,
  items,
}: {
  title: string;
  items: InfoItem[];
}) {
  return (
    <section className="grid gap-6 p-8 md:p-10 lg:grid-cols-3 lg:p-12">
      <BulletLabel className="self-start">{title}</BulletLabel>
      <dl className="grid gap-5 sm:grid-cols-2 lg:col-span-2">
        {items.map(({ label, value }) => (
          <div key={label}>
            <dt className="label text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm">{value || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
