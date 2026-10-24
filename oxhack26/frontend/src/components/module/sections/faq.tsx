"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { FAQS } from "~/lib/constants/faq";
import { cn, pad2 } from "~/lib/utils";
import { Collapse } from "../collapse";
import { SectionHeader } from "../section-header";

/**
 * Numbered, single-open accordion in a hairline-bordered list. The open row
 * tints grey and the plus rotates into a cross. Answers are plain text plus
 * an optional link, so there is no HTML injection surface.
 */
export function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <SectionHeader
        title="FAQs"
        subtitle="You have questions, we have answers!"
        className="pl-8 sm:pl-10 2xl:pl-0"
      />

      <ul className="mt-8 divide-y border bg-background md:mt-10">
        {FAQS.map((item, i) => {
          const expanded = open === i;
          return (
            <li
              key={item.q}
              className={cn(
                "transition-colors duration-300",
                expanded && "bg-muted"
              )}
            >
              <h3>
                <button
                  id={`faq-button-${i}`}
                  aria-expanded={expanded}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() => setOpen(expanded ? null : i)}
                  className="flex w-full items-center gap-4 px-4 py-5 text-left sm:gap-24 sm:px-6 md:gap-40"
                >
                  <span className="w-6 shrink-0 text-xs sm:w-8 sm:text-lg">
                    {pad2(i + 1)}
                  </span>
                  <span className="flex-1 font-heading text-base font-medium sm:text-xl md:text-2xl">
                    {item.q}
                  </span>
                  <Plus
                    className={cn(
                      "size-4 shrink-0 transition-transform duration-300 sm:size-5",
                      expanded && "rotate-45"
                    )}
                  />
                </button>
              </h3>
              <Collapse open={expanded} id={`faq-panel-${i}`}>
                <div
                  role="region"
                  aria-labelledby={`faq-button-${i}`}
                  className="pb-6 pl-[2.5rem] pr-8 text-[0.75rem] leading-relaxed sm:pl-[calc(1.5rem+2rem+6rem+1rem)] sm:pr-32 sm:text-sm md:pl-[calc(1.5rem+2rem+10rem+1rem)]"
                >
                  <p>{item.a}</p>
                  {item.link && (
                    <a
                      href={item.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block underline hover:opacity-80"
                    >
                      {item.link.label}
                    </a>
                  )}
                </div>
              </Collapse>
            </li>
          );
        })}
      </ul>
    </>
  );
}
