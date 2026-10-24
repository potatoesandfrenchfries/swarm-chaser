import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface Limiter {
  limit(key: string): Promise<{ success: boolean }>;
}

/** Fixed-window counter in process memory: right for one server, wrong across many. */
function memoryLimiter(requests: number, windowSeconds: number): Limiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    async limit(key) {
      const now = Date.now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        // Drop expired keys now and then so the map cannot grow without bound.
        if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
        hits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return { success: true };
      }
      entry.count += 1;
      return { success: entry.count <= requests };
    },
  };
}

function createLimiter(requests: number, windowSeconds: number, prefix: string): Limiter {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memoryLimiter(requests, windowSeconds);
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    prefix,
  });
}

// Name a limiter per kind of action, so one noisy route cannot starve another.
export const ratelimit = {
  signIn: createLimiter(10, 60, "rl:sign_in"),
  write: createLimiter(30, 60, "rl:write"),
  checkout: createLimiter(5, 60, "rl:checkout"),
};
