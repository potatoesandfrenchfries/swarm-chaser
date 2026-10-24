export type SponsorTier = "PLATINUM" | "GOLD" | "SILVER";

export type Perk = {
  /** Short caption, e.g. "Giveaway". */
  label: string;
  text: string;
  /**
   * While false the text renders as a redacted black bar. Flip it to true
   * when you're ready to announce.
   */
  revealed: boolean;
};

export type Sponsor = {
  name: string;
  tier: SponsorTier;
  overview: string;
  /** Logo in /public/sponsors. Falls back to the sponsor name. */
  logo?: string;
  website: string;
  /** What this partner is offering attendees. */
  perks: Perk[];
};

export const SPONSORS: Sponsor[] = [
  {
    name: "Acme Corp",
    tier: "PLATINUM",
    overview:
      "A leading provider of everything you can imagine, headquartered nowhere in particular.",
    website: "https://example.com",
    perks: [
      { label: "Giveaway", text: "xra vurg ran jolt", revealed: false },
      { label: "Workshop", text: "zor plix meta flux", revealed: false },
    ],
  },
  {
    name: "Globex",
    tier: "PLATINUM",
    overview: "A global company bringing rigorous thinking to hard problems.",
    website: "https://example.com",
    perks: [
      { label: "Giveaway", text: "sigma nova grid pack", revealed: false },
      { label: "Discount", text: "tensor flux keyset", revealed: false },
      { label: "Swag", text: "alpha kit delta", revealed: false },
    ],
  },
  {
    name: "Initech",
    tier: "GOLD",
    overview: "A company building software that people actually enjoy using.",
    website: "https://example.com",
    perks: [
      { label: "Discount", text: "neo rig vanta", revealed: false },
      { label: "Swag", text: "mecha key array", revealed: false },
    ],
  },
  {
    name: "Umbrella",
    tier: "SILVER",
    overview:
      "An independent studio shipping small, sharp products for big audiences.",
    website: "https://example.com",
    perks: [{ label: "Swag", text: "suite pro delta", revealed: false }],
  },
];
