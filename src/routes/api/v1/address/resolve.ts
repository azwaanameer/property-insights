import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../server/db";
import { handleResolve } from "../../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/address/resolve")({
  server: { handlers: { GET: ({ request }) => handleResolve(() => getDb(), request) } },
});
