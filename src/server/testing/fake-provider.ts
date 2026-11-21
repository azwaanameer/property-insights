// Test-only payment provider. Webhooks are signed with HMAC-SHA256 over the body, like the real one, so the verify path is real.
import { fromHex, hmacSha256, hmacSha256Verify, toHex } from "../crypto";
import { PaymentProviderError, WebhookSignatureError, type CheckoutInput, type CheckoutSession, type PaymentEvent, type PaymentProvider } from "../payments/types";

export const FAKE_WEBHOOK_SECRET = "fake-webhook-secret";

export class FakeProvider implements PaymentProvider {
  readonly id: string;
  readonly created: CheckoutInput[] = [];
  /** Set to make the next createCheckout fail the way a provider outage would. */
  failNext = false;

  constructor(id = "fake") {
    this.id = id;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    if (this.failNext) {
      this.failNext = false;
      throw new PaymentProviderError("fake provider outage");
    }
    this.created.push(input);
    return { url: `https://pay.example/session/${input.purchase_id}`, provider_ref: `fake_cs_${input.purchase_id}` };
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent> {
    const sig = fromHex(headers.get("x-fake-signature") ?? "");
    if (!sig || !(await hmacSha256Verify(FAKE_WEBHOOK_SECRET, rawBody, sig))) throw new WebhookSignatureError("signature mismatch");
    return JSON.parse(rawBody) as PaymentEvent;
  }
}

/** A webhook request the fake provider accepts. `tamper` changes the body after signing. */
export async function signedWebhook(event: PaymentEvent, opts: { tamper?: boolean } = {}): Promise<Request> {
  const body = JSON.stringify(event);
  const sig = toHex(await hmacSha256(FAKE_WEBHOOK_SECRET, body));
  return new Request("http://localhost/api/v1/webhooks/stripe", {
    method: "POST",
    headers: { "x-fake-signature": sig, "content-type": "application/json" },
    body: opts.tamper ? body.replace('"kind":"paid"', '"kind":"paid" ') : body,
  });
}
