import { SITE } from "~/lib/constants/site";

/** Label/value tiles with a hairline on top. A tile with `href` is one big link. */
export function EventFacts() {
  return (
    <dl className="mt-8 grid grid-cols-2 gap-x-12 gap-y-7 min-[1280px]:grid-cols-3">
      {SITE.facts.map(({ label, value, href }) => (
        <div
          key={label}
          className="relative min-w-0 border-t pr-6 pt-4 has-[a:hover]:border-foreground"
        >
          <dt className="mb-2 text-[17px] leading-snug text-muted-foreground">
            {label}
          </dt>
          <dd className="text-balance text-[clamp(23px,2.6vw,30px)] font-bold leading-tight tracking-tight">
            {href ? (
              <a
                href={href}
                className="no-underline after:absolute after:inset-0 after:content-['']"
              >
                {value}
              </a>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
