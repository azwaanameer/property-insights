// Dev-only unlock: no payment is taken. It exists only when ALLOW_DEV_UNLOCK=1 and STRIPE_SECRET_KEY is unset (see config.ts),
// and the checkout page shows a banner saying so. Never enable it in production.
import { type CheckoutInput, type CheckoutSession, type PaymentEvent, type PaymentProvider, WebhookSignatureError } from "./types";

export const DEV_UNLOCK_PATH = "/api/v1/dev/unlock";

export class DevProvider implements PaymentProvider {
  readonly id = "dev";

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    return { url: `${DEV_UNLOCK_PATH}?purchase=${encodeURIComponent(input.purchase_id)}`, provider_ref: `dev_${input.purchase_id}` };
  }

  async verifyWebhook(_rawBody: string, _headers: Headers): Promise<PaymentEvent> {
    throw new WebhookSignatureError("the dev provider has no webhooks");
  }
}
