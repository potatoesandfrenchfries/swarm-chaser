"use client";

import { useTabs } from "~/hooks/use-tabs";
import { cn } from "~/lib/utils";
import { BulletLabel } from "../bullet-label";

export type DashboardTab = {
  key: string;
  /** Short label in the tab strip. */
  label: string;
  /** Page title + caption shown in the header while this tab is active. */
  title: string;
  subtitle: string;
  disabled?: boolean;
  content: React.ReactNode;
};

/**
 * Header (caption + big title) on the left, 2-column tab grid on the right,
 * hairlines between everything. The active tab is a solid ink block.
 * Collapses to a single column below lg.
 */
export function DashboardShell({ tabs }: { tabs: DashboardTab[] }) {
  const keys = tabs.map((t) => t.key);
  const { active, setActive } = useTabs(keys, keys[0] ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  if (!current) return null;

  return (
    <div className="flex w-full flex-1 flex-col pb-40">
      <div className="flex flex-col border-b lg:flex-row">
        <header className="flex-1 p-8 md:p-10 lg:p-12">
          <BulletLabel className="text-[0.6rem] tracking-wider">
            {current.subtitle}
          </BulletLabel>
          <h1 className="pt-4 font-heading text-4xl font-black uppercase tracking-tight">
            {current.title}
          </h1>
        </header>

        <div
          role="tablist"
          className="grid w-full grid-cols-2 lg:max-w-[500px] lg:flex-1"
        >
          {tabs.map((tab, i) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active === tab.key}
              disabled={tab.disabled}
              onClick={() => setActive(tab.key)}
              className={cn(
                "w-full border-b py-8 text-sm uppercase tracking-wider transition-colors duration-200 md:py-10 lg:text-xs",
                i % 2 === 0 && "border-r",
                active === tab.key && "bg-foreground text-background",
                active !== tab.key &&
                  !tab.disabled &&
                  "hover:bg-muted hover:underline",
                tab.disabled &&
                  "cursor-not-allowed bg-muted text-muted-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="w-full">
        {current.content}
      </div>
    </div>
  );
}
