// Free: hit every property-level GET endpoint with the public "test" token for the sandbox VIC GNAF.
import { readFileSync, writeFileSync } from "node:fs";
const GNAF = "GAVIC419929404", BASE = "https://api.microburbs.com.au";
const eps = JSON.parse(readFileSync("data/microburbs_endpoints.json", "utf8"));
const res = [];
for (const [path, price] of eps) {
  if (!path.includes("{gnaf_id}")) continue;
  const url = BASE + path.replace("{gnaf_id}", GNAF);
  const r = await fetch(url, { headers: { Authorization: "Bearer test" } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  res.push({ path, price, status: r.status, body });
  await new Promise((s) => setTimeout(s, 120));
}
writeFileSync("data/raw/microburbs_sandbox_vic.json", JSON.stringify(res, null, 1));
const ok = res.filter((r) => r.status === 200);
console.log("property endpoints:", res.length, "| 200 OK:", ok.length, "| other:", res.filter(r=>r.status!==200).map(r=>r.status).reduce((a,s)=>(a[s]=(a[s]??0)+1,a),{}));
for (const r of ok) {
  const b = r.body; const keys = b && typeof b === "object" ? Object.keys(b).slice(0, 8).join(",") : String(b).slice(0, 60);
  const n = Array.isArray(b) ? b.length : Array.isArray(b?.results) ? b.results.length : "";
  console.log(r.path.replace("/v1/properties/{gnaf_id}", "").padEnd(42), r.price.padEnd(12), keys.slice(0, 90), n !== "" ? `[n=${n}]` : "");
}
