import { useEffect, useState } from "react";
import { ConnectPanel } from "./components/ConnectPanel";
import { Results } from "./components/Results";
import { Scenarios } from "./components/Scenarios";
import { Toolbar } from "./components/Toolbar";
import { loadAll } from "./data/load";
import MapView from "./map/MapView";
import { useStore } from "./store/useStore";

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready && s.mapReady);
  const toast = useStore((s) => s.toast);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAll().then(init, (e: Error) => setError(e.message));
  }, [init]);

  return (
    <div className="relative h-full overflow-hidden">
      <MapView />
      {error ? (
        <p className="absolute inset-x-0 top-1/2 z-10 text-center text-destructive">{error}</p>
      ) : !ready ? (
        <p className="absolute inset-x-0 top-1/2 z-10 text-center text-muted-foreground">Loading network…</p>
      ) : (
        <>
          <Toolbar />
          <Scenarios />
          <ConnectPanel />
          <Results />
        </>
      )}
      {toast && (
        <div role="status" className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
