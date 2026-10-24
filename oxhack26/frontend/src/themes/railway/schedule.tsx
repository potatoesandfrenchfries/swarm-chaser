import type { CSSProperties } from "react";

import { SCHEDULE } from "~/lib/constants/schedule";
import { formatDay, groupEventsByDay } from "~/lib/dates";
import { cn } from "~/lib/utils";
import { RailwaySection } from "./section";

/** Which palette stripe colours each day's line (cycles for 5+ days). */
const DAY_STRIPES = [2, 4, 1, 3] as const;

const STOP = 30; // marker diameter, px
const LINE = 7; // line width, px

/**
 * One metro line per day. Each event is a stop: a ring on the line, with the
 * time, title and place beside it. The line starts and ends at the first and
 * last stop. Server-rendered; no JS. Days sit side by side on desktop (up to
 * three) and stack on mobile.
 */
export function RailwaySchedule() {
  const days = groupEventsByDay(SCHEDULE);

  return (
    <RailwaySection id="schedule" palette="pink" title="Schedule">
      <div
        className={cn(
          "grid gap-x-12 gap-y-16",
          days.length === 2 && "md:grid-cols-2",
          days.length >= 3 && "md:grid-cols-3"
        )}
      >
        {days.map(({ day, events }, d) => {
          const { weekdayTitle, date } = formatDay(day);
          const stripe = DAY_STRIPES[d % DAY_STRIPES.length];
          return (
            <section
              key={day}
              aria-label={`${weekdayTitle} ${date}`}
              style={{ "--day": `var(--stripe-${stripe})` } as CSSProperties}
            >
              <h3 className="text-[30px] font-bold leading-tight">
                {weekdayTitle}
              </h3>
              <p className="mt-1.5 text-lg">{date}</p>

              <ol className="mt-8">
                {events.map((e, i) => {
                  const first = i === 0;
                  const last = i === events.length - 1;
                  return (
                    <li
                      key={e.id}
                      className="relative py-5"
                      style={{ paddingLeft: STOP + 25 }}
                    >
                      {/* line segment through this stop, trimmed at the ends */}
                      {events.length > 1 && (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute bg-[var(--day)]",
                            first ? "top-1/2" : "top-0",
                            last ? "bottom-1/2" : "bottom-0"
                          )}
                          style={{ left: (STOP - LINE) / 2, width: LINE }}
                        />
                      )}
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border-foreground bg-background"
                        style={{
                          width: STOP,
                          height: STOP,
                          borderWidth: LINE,
                          borderStyle: "solid",
                        }}
                      />
                      <time className="block text-[23px] font-bold tabular-nums leading-tight">
                        {e.start}
                        <span className="sr-only"> to {e.end}</span>
                      </time>
                      <p className="text-xl font-bold leading-tight">
                        {e.title}
                      </p>
                      {e.location && (
                        <p className="mt-0.5 text-muted-foreground">
                          {e.location}
                        </p>
                      )}
                      {e.description && (
                        <p className="mt-1 max-w-[40ch] text-[17px] leading-snug">
                          {e.description}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </RailwaySection>
  );
}
