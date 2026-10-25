import type { Bundle } from '../model/types.ts';
import { LandingView } from './LandingView.tsx';

export function HomeView({ bundle }: { bundle: Bundle }) {
  return <LandingView bundle={bundle} />;
}
