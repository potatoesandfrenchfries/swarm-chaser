export type ScheduleEvent = {
  id: string;
  /** ISO date (YYYY-MM-DD). Events are grouped into one column per day. */
  day: string;
  /** 24h "HH:mm". The timeline window is 09:00–23:00 by default. */
  start: string;
  end: string;
  title: string;
  location?: string;
  description?: string;
};

export const SCHEDULE: ScheduleEvent[] = [
  {
    id: "arrival",
    day: "2026-11-01",
    start: "09:00",
    end: "10:00",
    title: "Doors open",
    location: "@MAIN_FOYER",
    description: "Check in, collect your badge and get settled.",
  },
  {
    id: "opening",
    day: "2026-11-01",
    start: "10:00",
    end: "11:00",
    title: "Welcome",
    location: "@LECTURE_THEATRE",
    description: "Opening remarks and a look at the weekend.",
  },
  {
    id: "teams",
    day: "2026-11-01",
    start: "11:00",
    end: "12:00",
    title: "Keynote",
    location: "@MAIN_FOYER",
    description: "Our opening speaker on where the field is heading.",
  },
  {
    id: "lunch-1",
    day: "2026-11-01",
    start: "13:00",
    end: "14:00",
    title: "Lunch",
    location: "@FIRST_FLOOR",
  },
  {
    id: "workshop",
    day: "2026-11-01",
    start: "14:00",
    end: "16:00",
    title: "Workshop",
    location: "@TBA",
    description: "A hands-on session led by one of our partners.",
  },
  {
    id: "dinner",
    day: "2026-11-01",
    start: "19:30",
    end: "20:30",
    title: "Dinner",
    location: "@FIRST_FLOOR",
  },
  {
    id: "breakfast",
    day: "2026-11-02",
    start: "08:30",
    end: "09:30",
    title: "Breakfast",
    location: "@FIRST_FLOOR",
  },
  {
    id: "submission",
    day: "2026-11-02",
    start: "11:00",
    end: "12:00",
    title: "Panel",
    location: "@MAIN_FOYER",
    description: "Guests discuss the year in review.",
  },
  {
    id: "lunch-2",
    day: "2026-11-02",
    start: "12:00",
    end: "13:00",
    title: "Lunch",
    location: "@FIRST_FLOOR",
  },
  {
    id: "demos",
    day: "2026-11-02",
    start: "13:00",
    end: "15:00",
    title: "Showcase",
    location: "@TBA",
  },
  {
    id: "results",
    day: "2026-11-02",
    start: "15:00",
    end: "15:30",
    title: "Awards",
    location: "@LECTURE_THEATRE",
    description: "Recognising the people who made it happen.",
  },
  {
    id: "closing",
    day: "2026-11-02",
    start: "15:30",
    end: "17:00",
    title: "Closing Ceremony",
    location: "@LECTURE_THEATRE",
    description: "Thank-yous and what comes next.",
  },
];
