import { z } from "zod";

// Runtime validation of environment variables. Server-only: do not import this
// file from a client component.
//
// Validated on first use, not on import, so `next build` works without secrets
// and a missing variable fails with a readable message the first time a route
// needs it.

const optional = z.string().min(1).optional();

const schema = z.object({
  DATABASE_URL: z.string().startsWith("postgres"),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters (openssl rand -base64 32)"),
  ALLOW_DEMO_LOGIN: z.enum(["true", "false"]).default("false"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  STRIPE_PRICE_ID: z.string().startsWith("price_").optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  // Empty strings (a blank line in .env) count as unset.
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((key) => [key, process.env[key] || undefined])
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return (cached = parsed.data);
}

/** Stripe is optional: every feature that needs it checks this first. */
export function paymentsEnabled() {
  const env = getEnv();
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_ID);
}
