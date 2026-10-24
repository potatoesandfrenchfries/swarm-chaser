# SaaS starter template

The plumbing most products need before the first feature: sign-in, a Postgres
database, a one-off Stripe payment that unlocks content, rate limiting, security
headers and validated config.

Distilled from Cultivate, an event-networking app built in 36 hours (QR capture,
a people graph, a £1 "unlock the network" payment). The event domain is gone;
the plumbing is kept and runs against a neutral example: a **project** with a
public summary and private notes. Share the link, and anyone who pays can read
the notes.

**Stack:** Next.js (App Router) · React 19 · TypeScript · Tailwind CSS 3 · NextAuth v4 · Prisma 6 + Postgres · Stripe · Upstash (optional) · zod

## Run it

You need a Postgres database (local, or a free [Neon](https://neon.tech) one).

```bash
pnpm install
cp .env.example .env            # Prisma reads .env, not .env.local
# set DATABASE_URL, and NEXTAUTH_SECRET: openssl rand -base64 32
pnpm db:deploy                  # applies prisma/migrations
pnpm dev                        # http://localhost:3000
```

With no OAuth keys the app offers **demo sign-in** (any email, no password), so
it is usable immediately. Payments stay off until you add Stripe keys.

| Script            | What it does                                              |
| ----------------- | --------------------------------------------------------- |
| `pnpm dev`        | Dev server                                                |
| `pnpm build`      | Production build (needs no secrets)                       |
| `pnpm ci`         | lint, typecheck, build                                    |
| `pnpm db:migrate` | Create and apply a migration after you change the schema  |
| `pnpm db:deploy`  | Apply existing migrations (production)                    |
| `pnpm db:studio`  | Browse the database                                       |

### Turn on payments

1. In Stripe (test mode), create a one-off **Price** and copy its `price_…` id.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` in `.env`.
3. Locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET`. In production, add a webhook endpoint for `/api/webhooks/stripe` with `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired`.

## How it fits together

| Path                                  | What                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/lib/env.ts`                      | zod-validated config, checked on first use (so builds need no secrets), with a readable error |
| `src/lib/auth.ts`                     | NextAuth: Google if configured, demo sign-in if enabled or nothing else exists        |
| `src/lib/session.ts`                  | `getCurrentUser()`: the signed-in user's database row                                 |
| `src/lib/access.ts`                   | `checkAccess()`: the one place that decides who may read the gated notes              |
| `src/lib/rate-limit.ts`               | Named limiters; Upstash when configured, in-memory otherwise                          |
| `src/lib/url-security.ts`             | Use before the server fetches any user-supplied URL (blocks localhost, private ranges, IP literals) |
| `src/proxy.ts`                        | Security headers (HSTS, CSP, frame and content-type protection)                       |
| `src/app/api/projects/`               | Owner CRUD, with validation and per-user rate limits                                  |
| `src/app/api/share/[slug]/unlock/`    | Starts (or resumes) a Stripe Checkout session                                         |
| `src/app/api/webhooks/stripe/`        | The only place an unlock becomes paid                                                 |
| `src/app/p/[slug]/`                   | Public share page; notes are only sent to someone who passes `checkAccess`            |
| `src/app/api/health/`                 | Uptime check that also pings the database                                             |
| `prisma/schema.prisma`                | `User`, `Project`, `Unlock`                                                           |

Choices worth keeping when you adapt it:

- **Payment is granted by the webhook, never by the redirect.** The success page grants nothing. The handler checks the signature on the raw body, ignores `unpaid` sessions, and is idempotent (a redelivered event changes nothing).
- **One function decides access.** Every gated read goes through `checkAccess`; the notes are not in the HTML for anyone who has not passed it.
- **Not-yours and not-found look the same.** A non-owner gets the same 404 as a missing id, so ids cannot be probed.
- **Users are created by us, not by NextAuth.** JWT sessions use no adapter, so both sign-in paths upsert the `User` row; without that, a first-time Google user would be signed in but unknown.
- **A pending checkout is reused**, not duplicated, and an expired one is cleared so the next attempt starts fresh.

## Make it yours

| Want to                          | Edit                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Rename `Project` to your noun    | `prisma/schema.prisma`, then `pnpm db:migrate`; routes under `src/app/api/projects` and `src/app/projects` |
| Change what is gated             | `src/app/p/[slug]/page.tsx` and `checkAccess` in `src/lib/access.ts`              |
| Subscriptions instead of one-off | `mode: "subscription"` in the unlock route; handle `invoice.paid` and cancellations in the webhook |
| Add a sign-in provider           | `src/lib/auth.ts` and the env schema                                              |
| Restyle                          | CSS variables in `src/app/globals.css`                                            |

## Things to know

- **Demo sign-in is not authentication.** Anyone can sign in as any email. It switches itself on when no OAuth provider exists; set real providers and leave `ALLOW_DEMO_LOGIN` unset before putting real data in.
- **In-memory rate limits are per process.** Fine for one server; on serverless, set the Upstash variables or the limits reset on every cold start.
- **The CSP allows `unsafe-inline` and `unsafe-eval`** because Next's dev tooling and bootstrap scripts need them. Tighten with nonces before launch.
- **No tests are included.** The flows were exercised by hand against a real Postgres: sign-in, create, share, locked and unlocked views, ownership checks, and signed webhooks (bad signature, unpaid, paid, redelivery). Creating a real Stripe Checkout session was not tested, since that needs a live Stripe key.
- **Next.js here is a recent major.** It calls `middleware` "proxy" (`src/proxy.ts`). Check `node_modules/next/dist/docs/` before relying on older conventions.
