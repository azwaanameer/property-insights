// Prints the response fields of the Domain API endpoints relevant to an investor report.
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync("data/raw/domain/openapi.json", "utf8"));
const deref = (o, depth = 0, seen = new Set()) => {
  if (!o || typeof o !== "object" || depth > 5) return o;
  if (o.$ref) { const n = o.$ref.split("/").pop(); if (seen.has(n)) return `<${n}>`; seen = new Set(seen).add(n); return deref(s.components.schemas[n], depth + 1, seen); }
  if (o.type === "array") return [deref(o.items, depth + 1, seen)];
  if (o.properties) return Object.fromEntries(Object.entries(o.properties).map(([k, v]) => [k, deref(v, depth + 1, seen)]));
  return o.type ? (o.enum ? `${o.type}(${o.enum.slice(0, 6).join("|")})` : o.format ? `${o.type}:${o.format}` : o.type) : "obj";
};
const show = (p, label) => {
  const op = s.paths[p].get || s.paths[p].post;
  const params = (op.parameters || []).map((x) => `${x.name}${x.required ? "*" : ""}`).join(", ");
  const resp = op.responses?.["200"]?.content?.["application/json"]?.schema;
  console.log(`\n### ${label}  ${p}\nparams: ${params}\n${op.description ? "desc: " + op.description.slice(0, 400) : ""}\nresponse: ${JSON.stringify(deref(resp), null, 0).slice(0, 1800)}`);
};
show("/v2/suburbPerformanceStatistics/{state}/{suburb}/{postcode}", "Suburb performance");
show("/v2/demographics/{state}/{suburb}/{postcode}", "Demographics");
show("/v2/property/features", "Property features");
show("/v2/properties/search/like/{searchType}", "Comparable properties");
show("/v2/property/zoning-perils", "Zoning and perils");
show("/v2/salesResults/saturday", "Sales results");
