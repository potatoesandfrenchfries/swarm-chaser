"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Tab state kept in the URL (`?tab=key`) so tabs are linkable and survive
 * refresh. Components using this must sit under a <Suspense> boundary.
 */
export function useTabs<K extends string>(keys: readonly K[], fallback: K) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const fromUrl = params.get("tab");
  const active = keys.find((k) => k === fromUrl) ?? fallback;

  const setActive = (key: K) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return { active, setActive };
}
