export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  /** Square portrait in /public/team. Falls back to initials. */
  image?: string;
  /** Optional animated version swapped in on hover. */
  gif?: string;
  link?: string;
};

export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Alex Director",
    role: "Director",
    bio: "Making sure the weekend is fun for everyone and runs smoothly.",
    link: "https://example.com",
  },
  {
    name: "Sam Events",
    role: "Events Lead",
    bio: "Organising big events and wrangling logistics.",
    link: "https://example.com",
  },
  {
    name: "Robin Tech",
    role: "Tech Lead",
    bio: "Building a site that feels intuitive to use.",
    link: "https://example.com",
  },
  {
    name: "Kim Design",
    role: "Design Lead",
    bio: "Designing visual experiences even your grandma would love.",
    link: "https://example.com",
  },
  {
    name: "Jo Sponsors",
    role: "Sponsorship",
    bio: "Talking to partners so the weekend can happen.",
    link: "https://example.com",
  },
  {
    name: "Max Logistics",
    role: "Logistics",
    bio: "Making sure everyone is fed and watered.",
    link: "https://example.com",
  },
  {
    name: "Lee Marketing",
    role: "Marketing",
    bio: "Telling the world what we're up to.",
    link: "https://example.com",
  },
  {
    name: "Pat Volunteer",
    role: "Volunteers",
    bio: "Keeping the volunteers happy and the venue running.",
    link: "https://example.com",
  },
];
