import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Query values stay plain text. The router's own parser turns "310" into the number 310 and "1E3" into 1000, and its writer
// quotes strings that look like numbers (?unit=%22310%22). The only query value on this site is a unit such as "310" or "5A".
function parseSearch(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true, parseSearch, stringifySearch });
}
