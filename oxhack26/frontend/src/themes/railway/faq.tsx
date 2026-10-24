import { FAQS } from "~/lib/constants/faq";
import { RailwaySection } from "./section";

const STATION = 32; // ring diameter, px
const TRACK = 5; // line width, px

/**
 * Native <details> (no JS). All rows share name="faqs", so opening one closes
 * the others. Each question is a station; the open one extends a line down
 * through its answer and everything turns the section colour.
 */
export function RailwayFaq() {
  return (
    <RailwaySection id="faqs" palette="purple" title="FAQs">
      <div>
        {FAQS.map((item, i) => (
          <details
            key={item.q}
            name="faqs"
            open={i === 0}
            className="group border-b py-6 first:pt-0"
          >
            <summary
              className="grid min-h-11 cursor-pointer list-none items-center text-2xl font-bold leading-tight tracking-tight text-muted-foreground hover:text-foreground group-open:text-[var(--stripe-1)] md:text-3xl [&::-webkit-details-marker]:hidden"
              style={{
                gridTemplateColumns: `${STATION}px minmax(0, 1fr)`,
                columnGap: 16,
              }}
            >
              <span className="relative grid place-items-center self-stretch">
                <span
                  aria-hidden
                  className="absolute top-1/2 hidden h-[calc(50%+1px)] bg-[var(--stripe-1)] group-open:block"
                  style={{ left: (STATION - TRACK) / 2, width: TRACK }}
                />
                <svg
                  viewBox="0 0 32 32"
                  width={STATION}
                  height={STATION}
                  aria-hidden
                  className="relative"
                >
                  <circle
                    cx="16"
                    cy="16"
                    r="13"
                    strokeWidth="6"
                    stroke="currentColor"
                    fill="hsl(var(--background))"
                  />
                </svg>
              </span>
              <span>{item.q}</span>
            </summary>

            <div
              className="relative pt-4"
              style={{ paddingLeft: STATION + 16 }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 rounded-b-sm bg-[var(--stripe-1)]"
                style={{ left: (STATION - TRACK) / 2, width: TRACK }}
              />
              <p className="max-w-[64ch] text-[17px] leading-relaxed md:text-xl">
                {item.a}
              </p>
              {item.link && (
                <a
                  href={item.link.href}
                  className="mt-3 inline-block text-[var(--stripe-1)] hover:text-foreground"
                >
                  {item.link.label}
                </a>
              )}
            </div>
          </details>
        ))}
      </div>
    </RailwaySection>
  );
}
