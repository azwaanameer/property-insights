// Lists the Domain public API endpoints and the fields of the ones relevant to investor due diligence.
import { readFileSync } from "node:fs";
const s = JSON.parse(readFileSync("data/raw/domain/openapi.json", "utf8"));
console.log(s.info.title, s.info.version, "| servers:", (s.servers ?? []).map((x) => x.url).join(", "));
const paths = Object.entries(s.paths);
console.log("paths:", paths.length);
for (const [p, ops] of paths) for (const [m, o] of Object.entries(ops)) if (["get", "post"].includes(m)) console.log(m.toUpperCase().padEnd(5), p.padEnd(70), "|", (o.summary || o.operationId || "").slice(0, 70), "|", (o.tags || []).join(","));
