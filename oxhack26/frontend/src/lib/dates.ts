export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** "2026-11-01" -> display parts. Noon avoids timezone day-shifts. */
export const formatDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  return {
    number: String(d.getDate()).padStart(2, "0"),
    ordinal: ordinal(d.getDate()),
    weekday: weekday.toUpperCase(),
    weekdayTitle: weekday,
    month,
    date: `${ordinal(d.getDate())} ${month}`,
  };
};

/** Groups events by `day`, days ascending, events ascending by `start`. */
export function groupEventsByDay<T extends { day: string; start: string }>(
  events: readonly T[]
) {
  const byDay = new Map<string, T[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  return [...byDay.keys()].sort().map((day) => ({
    day,
    events: (byDay.get(day) ?? []).sort((a, b) =>
      a.start.localeCompare(b.start)
    ),
  }));
}
