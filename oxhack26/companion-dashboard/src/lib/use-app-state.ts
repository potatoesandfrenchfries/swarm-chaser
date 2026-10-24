"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppState, Role } from "./types";

const POLL_MS = 4000;

/**
 * The view's data, polled so the two roles see each other's changes: a task
 * the member ticks off or a concern the agent records shows up on the other
 * screen within a few seconds. Swap polling for SSE or websockets if you need
 * it instant.
 */
export function useAppState(role: Role) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      fetch(`/api/state?role=${role}`)
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error);
          setState(body);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [role]
  );

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { state, error, refresh, setState };
}

/** PATCH/POST/DELETE helper that throws the API's error message. */
export async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
}
