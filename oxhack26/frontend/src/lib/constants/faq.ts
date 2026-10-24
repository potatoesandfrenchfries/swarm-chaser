export type Faq = {
  q: string;
  a: string;
  /** Optional trailing link, rendered underlined after the answer. */
  link?: { label: string; href: string };
};

export const FAQS: Faq[] = [
  {
    q: "How do I get help on the day?",
    a: "Find any organiser in person: we wear the event t-shirt so you can spot us. You can also message us on our chat server and we'll reply as soon as we can.",
  },
  {
    q: "What is the Code of Conduct?",
    a: "Be kind, be inclusive, and don't harass anyone. The full text is below.",
    link: {
      label: "Read the Code of Conduct",
      href: "/documents/code-of-conduct.pdf",
    },
  },
  {
    q: "When does registration close?",
    a: "Registration closes on the 29th of September. We aim to confirm every place by the 6th of October.",
  },
  {
    q: "Is there travel support?",
    a: "If you're travelling from outside the city we may be able to cover part of your travel, based on distance.",
  },
  {
    q: "Can I bring a guest?",
    a: "Guests need their own registration. Each person registers separately and can request to sit together.",
  },
  {
    q: "Do I need any experience?",
    a: "No. We welcome everyone, and volunteers will be on hand all weekend to help you find your way.",
  },
];
