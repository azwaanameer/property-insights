import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../server/db";
import { handlePurchaseStatus } from "../../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/purchases/me")({
  server: { handlers: { GET: ({ request }) => handlePurchaseStatus(() => getDb(), request) } },
});
