import { TEAM_MEMBERS } from "~/lib/constants/team";
import { LEGAL_LINKS, SITE } from "~/lib/constants/site";

/**
 * Credits strip: who made it, then legal links. Uses the team data.
 * People sit on an even grid (2 columns on phones, 4 from `sm`) so every row
 * has the same edges, with no orphaned last name.
 */
export function RailwayFooter() {
  return (
    <footer className="flex flex-col items-center gap-8 border-t px-4 py-10 text-center sm:px-6 md:py-12">
      <h2 className="text-2xl font-bold leading-tight">Made by</h2>

      <ul className="grid w-full max-w-4xl grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {TEAM_MEMBERS.map((m) => (
          <li key={m.name} className="min-w-0">
            {m.link ? (
              <a
                href={m.link}
                className="block truncate no-underline hover:underline"
              >
                {m.name}
              </a>
            ) : (
              <span className="block truncate">{m.name}</span>
            )}
            <span className="block truncate text-[0.85em] text-muted-foreground">
              {m.role}
            </span>
          </li>
        ))}
      </ul>

      <nav
        aria-label="Legal"
        className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-muted-foreground"
      >
        <span>{SITE.copyright}</span>
        {LEGAL_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="underline hover:text-foreground"
          >
            {l.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
