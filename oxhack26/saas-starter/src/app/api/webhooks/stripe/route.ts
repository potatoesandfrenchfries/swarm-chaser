import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { prisma } from "~/lib/db";
import { getEnv } from "~/lib/env";
import { logger } from "~/lib/logger";
import { getStripe } from "~/lib/stripe";

const unlockIdOf = (session: Stripe.Checkout.Session) =>
  session.metadata?.unlockId ?? session.client_reference_id ?? null;

// This is the only place an Unlock becomes "paid". The success page is a
// courtesy; never grant access from the browser redirect.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Payments are not set up." }, { status: 501 });

  // The signature covers the raw body: read it as text, before anything parses it.
  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      req.headers.get("stripe-signature") ?? "",
      getEnv().STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // "completed" also fires for delayed payment methods that have not paid yet.
        if (session.payment_status === "unpaid") break;
        const id = unlockIdOf(session);
        if (!id) break;
        // The `not paid` guard makes a redelivered event a no-op.
        const { count } = await prisma.unlock.updateMany({
          where: { id, status: { not: "paid" } },
          data: { status: "paid", paidAt: new Date() },
        });
        if (count > 0) logger.info("Unlock paid", { unlockId: id, type: event.type });
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const id = unlockIdOf(session);
        if (!id) break;
        // Clear the dead session id so the next attempt starts a fresh one.
        await prisma.unlock.updateMany({
          where: { id, stripeCheckoutSessionId: session.id, status: { not: "paid" } },
          data: { stripeCheckoutSessionId: null },
        });
        break;
      }
    }
  } catch (error) {
    // 200 anyway: a transient DB error should not make Stripe retry a handled event
    // forever. The log is the alarm.
    logger.error("Stripe webhook handler failed", { type: event.type }, error);
  }
  return NextResponse.json({ received: true });
}
