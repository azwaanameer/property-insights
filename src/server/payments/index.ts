// Picks the payment provider from the environment. Stripe when a key exists, the dev unlock only when asked for, otherwise none.
import { devUnlockEnabled, type Env } from "../config";
import { DevProvider } from "./dev";
import { StripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

export type PaymentMode = "stripe" | "dev" | "none";

/**
 * A Stripe key without the webhook secret is not a working setup: money could be taken and no purchase could ever turn paid,
 * so it counts as not configured. The dev unlock needs a local host name.
 */
export function paymentMode(env: Env, hostname?: string): PaymentMode {
  if (env.STRIPE_SECRET_KEY) return env.STRIPE_WEBHOOK_SECRET ? "stripe" : "none";
  return devUnlockEnabled(env, hostname) ? "dev" : "none";
}

export function selectProvider(env: Env, hostname?: string): PaymentProvider | null {
  const mode = paymentMode(env, hostname);
  if (mode === "stripe") return new StripeProvider({ secretKey: env.STRIPE_SECRET_KEY!, webhookSecret: env.STRIPE_WEBHOOK_SECRET });
  if (mode === "dev") return new DevProvider();
  return null;
}

export type { PaymentProvider } from "./types";
