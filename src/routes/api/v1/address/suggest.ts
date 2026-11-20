import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../server/db";
import { handleSuggest } from "../../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/address/suggest")({
  server: { handlers: { GET: ({ request }) => handleSuggest(() => getDb(), request) } },
});
