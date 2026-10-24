import type { Metadata } from "next";
import { Suspense } from "react";

import {
  DashboardShell,
  type DashboardTab,
} from "~/components/module/dashboard/dashboard-shell";
import { InfoSection } from "~/components/module/dashboard/info-section";
import { Panel } from "~/components/module/dashboard/panel";

export const metadata: Metadata = { title: "Dashboard" };

// Replace with real data (database / API) in your own page.
const DEMO_USER = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  pronouns: "she/her",
  organisation: "Example Ltd",
  role: "Engineer",
};

const TABS: DashboardTab[] = [
  {
    key: "profile",
    label: "PROFILE",
    title: "Your profile",
    subtitle: "PERSONAL INFORMATION",
    content: (
      <div className="divide-y">
        <InfoSection
          title="Basic information"
          items={[
            { label: "Full name", value: DEMO_USER.name },
            { label: "Email", value: DEMO_USER.email },
            { label: "Pronouns", value: DEMO_USER.pronouns },
          ]}
        />
        <InfoSection
          title="Organisation"
          items={[
            { label: "Organisation", value: DEMO_USER.organisation },
            { label: "Role", value: DEMO_USER.role },
          ]}
        />
      </div>
    ),
  },
  {
    key: "sessions",
    label: "YOUR SESSIONS",
    title: "Your sessions",
    subtitle: "SAVED FROM THE PROGRAMME",
    content: (
      <Panel title="Nothing saved yet">
        Sessions you save from the schedule will appear here.
      </Panel>
    ),
  },
  {
    key: "resources",
    label: "RESOURCES",
    title: "Resources",
    subtitle: "GUIDES & DOWNLOADS",
    content: (
      <Panel title="Before you arrive">
        Venue maps, travel guides and the attendee handbook will be listed here.
      </Panel>
    ),
  },
  {
    key: "recap",
    label: "RECAP",
    title: "Recap",
    subtitle: "COMING SOON",
    disabled: true,
    content: null,
  },
];

export default function DashboardPage() {
  return (
    // useTabs reads the URL, so the shell needs a Suspense boundary.
    <Suspense>
      <DashboardShell tabs={TABS} />
    </Suspense>
  );
}
