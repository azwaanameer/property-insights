// The payment seam. The rest of the app knows only this interface, so Stripe can be replaced without touching callers.
import type { PlanId } from "../../config/pricing";

export interface CheckoutInput {
  purchase_id: string;
  plan: PlanId;
  email: string;
  /** The address a `one` purchase unlocks. Null for pro. */
  gnaf_pid: string | null;
  amount_cents: number;
  currency: string;
  /** Product line shown on the provider's page. */
  description: string;
  success_url: string;
  cancel_url: string;
}

export interface CheckoutSession {
  /** Where to send the buyer. May be a relative path (dev provider). */
  url: string;
  /** The provider's id for this checkout. */
  provider_ref: string;
}

/** What a verified webhook means for us. Anything we do not act on is `ignored`. */
export type PaymentEvent =
  | {
      id: string;
      kind: "paid";
      purchase_id: string | null;
      provider_ref: string | null;
      payment_ref: string | null;
      subscription_ref: string | null;
      /** What the provider says was charged and how. Checked against the purchase row before anything is marked paid. */
      amount_cents: number | null;
      currency: string | null;
      mode: "payment" | "subscription" | null;
    }
  | { id: string; kind: "failed"; purchase_id: string | null }
  | { id: string; kind: "refunded"; purchase_id: string | null; payment_refs: string[] }
  | { id: string; kind: "renewed"; subscription_ref: string }
  | { id: string; kind: "ended"; subscription_ref: string }
  | { id: string; kind: "ignored"; type: string };

export interface PaymentProvider {
  readonly id: "stripe" | "dev" | (string & {});
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  /** Throws WebhookSignatureError when the signature does not match. Never returns an unverified event. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent>;
}

export class WebhookSignatureError extends Error {
  constructor(message = "webhook signature could not be verified") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/** The provider refused or failed. The message is safe to log and never holds a key or card data. */
export class PaymentProviderError extends Error {
  constructor(message: string, readonly kind: "failed" | "not_configured" = "failed") {
    super(message);
    this.name = "PaymentProviderError";
  }
}
