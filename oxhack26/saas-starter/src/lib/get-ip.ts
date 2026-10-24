type HeaderGetter = (name: string) => string | null | undefined;

/**
 * Client IP for rate limiting. Behind Vercel or another proxy the first
 * x-forwarded-for entry is the real client; elsewhere a client can spoof it, so
 * treat it as a soft key, not as identity.
 */
export function clientIpFrom(get: HeaderGetter): string {
  const forwarded = get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return get("x-real-ip")?.trim() || "unknown";
}

export const getClientIp = (req: Request) => clientIpFrom((name) => req.headers.get(name));
