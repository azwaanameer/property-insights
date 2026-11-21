import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../server/db";
import { handleCheckoutInfo, handleCheckoutStart } from "../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/checkout")({
  server: {
    handlers: {
      GET: ({ request }) => handleCheckoutInfo(() => getDb(), request),
      POST: ({ request }) => handleCheckoutStart(() => getDb(), request),
    },
  },
});
