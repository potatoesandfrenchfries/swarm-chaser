import { theme } from "~/themes";

/** Each theme composes its own landing page; see landing.tsx in each theme folder. */
export default function LandingPage() {
  const { Landing } = theme;
  return <Landing />;
}
