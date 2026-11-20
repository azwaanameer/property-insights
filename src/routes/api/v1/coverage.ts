import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "../../../server/db";
import { handleCoverage } from "../../../server/http/handlers";

export const Route = createFileRoute("/api/v1/coverage")({
  server: { handlers: { GET: () => handleCoverage(() => getDb()) } },
});
