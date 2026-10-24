import { ABOUT_PARAGRAPHS } from "~/lib/constants/about";
import { RailwaySection } from "./section";

/** `**word**` -> highlighted in the section accent. */
function Emphasised({ text }: { text: string }) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 ? (
      <strong key={i} className="text-[var(--accent)]">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

export function RailwayAbout() {
  return (
    <RailwaySection
      id="about"
      palette="blue"
      title="About"
      className="grid gap-6 md:grid-cols-2 md:gap-12"
    >
      {ABOUT_PARAGRAPHS.map((p) => (
        <p
          key={p}
          className="text-[clamp(18px,2.2vw,27px)] leading-normal [hyphens:auto]"
        >
          <Emphasised text={p} />
        </p>
      ))}
    </RailwaySection>
  );
}
