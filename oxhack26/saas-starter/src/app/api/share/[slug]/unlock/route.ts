import { apiError, handle, json } from "~/lib/api";
import { prisma } from "~/lib/db";
import { getEnv, paymentsEnabled } from "~/lib/env";
import { getClientIp } from "~/lib/get-ip";
import { ratelimit } from "~/lib/rate-limit";
import { getCurrentUser } from "~/lib/session";
import { getStripe } from "~/lib/stripe";

/**
 * Start (or resume) a Stripe Checkout session that unlocks a shared project's
 * notes for the signed-in user. Returns `{ url }` to redirect to.
 */
export const POST = (req: Request, { params }: { params: Promise<{ slug: string }> }) =>
  handle(async () => {
    const user = await getCurrentUser();
    if (!user) return apiError("Sign in to unlock.", 401);

    const stripe = getStripe();
    if (!stripe || !paymentsEnabled()) return apiError("Payments are not set up on this deployment.", 501);

    if (!(await ratelimit.checkout.limit(`${user.id}:${getClientIp(req)}`)).success) {
      return apiError("Too many attempts. Try again in a minute.", 429);
    }

    const { slug } = await params;
    const project = await prisma.project.findUnique({ where: { shareSlug: slug } });
    if (!project) return apiError("Project not found", 404);

    const origin = getEnv().NEXTAUTH_URL;
    if (project.ownerId === user.id) return json({ url: `${origin}/projects/${project.id}`, alreadyUnlocked: true });

    // One row per user and project; created on first attempt, reused after.
    const unlock = await prisma.unlock.upsert({
      where: { userId_projectId: { userId: user.id, projectId: project.id } },
      update: {},
      create: { userId: user.id, projectId: project.id },
    });
    if (unlock.status === "paid") return json({ url: `${origin}/p/${slug}`, alreadyUnlocked: true });

    // Reuse a still-open session instead of minting duplicates.
    if (unlock.stripeCheckoutSessionId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(unlock.stripeCheckoutSessionId);
        if (existing.status === "open" && existing.url) return json({ url: existing.url });
      } catch {
        // Expired or unknown id: fall through and create a new one.
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: getEnv().STRIPE_PRICE_ID!, quantity: 1 }],
      customer_email: user.email,
      success_url: `${origin}/unlock/success?slug=${encodeURIComponent(slug)}`,
      cancel_url: `${origin}/p/${slug}`,
      client_reference_id: unlock.id,
      metadata: { unlockId: unlock.id },
    });
    await prisma.unlock.update({ where: { id: unlock.id }, data: { stripeCheckoutSessionId: session.id } });
    return json({ url: session.url });
  });
