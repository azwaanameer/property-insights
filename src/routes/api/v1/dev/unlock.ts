import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../server/db";
import { handleDevUnlock } from "../../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/dev/unlock")({
  server: { handlers: { GET: ({ request }) => handleDevUnlock(() => getDb(), request) } },
});
