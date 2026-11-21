import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../server/db";
import { handleStripeWebhook } from "../../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/webhooks/stripe")({
  server: { handlers: { POST: ({ request }) => handleStripeWebhook(() => getDb(), request) } },
});
