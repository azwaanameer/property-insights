import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../../server/db";
import { handleAddress } from "../../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/address/$gnafPid")({
  server: { handlers: { GET: ({ request, params }) => handleAddress(() => getDb(), request, params) } },
});
