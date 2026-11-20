import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../../server/db";
import { handleReport } from "../../../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/property/$gnafPid/report")({
  server: { handlers: { GET: ({ request, params }) => handleReport(() => getDb(), request, params) } },
});
