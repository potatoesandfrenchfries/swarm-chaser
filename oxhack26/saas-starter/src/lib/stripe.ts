import Stripe from "stripe";
import { getEnv, paymentsEnabled } from "./env";

let client: Stripe | undefined;

/** The Stripe client, or null when payments are not configured. */
export function getStripe(): Stripe | null {
  if (!paymentsEnabled()) return null;
  return (client ??= new Stripe(getEnv().STRIPE_SECRET_KEY!));
}
