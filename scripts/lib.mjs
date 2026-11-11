import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
export const WFS = "https://opendata.maps.vic.gov.au/geoserver/wfs";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function cachePath(name) { mkdirSync("data/raw", { recursive: true }); return `data/raw/${name}.json`; }
export async function cached(name, fn) {
  const p = cachePath(name);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  const v = await fn(); writeFileSync(p, JSON.stringify(v)); return v;
}
export async function wfs(typeName, cql, count = 3000, props) {
  const u = new URL(WFS);
  Object.entries({ service: "WFS", version: "2.0.0", request: "GetFeature", typeNames: `open-data-platform:${typeName}`,
    outputFormat: "application/json", count, CQL_FILTER: cql, ...(props ? { propertyName: props } : {}) }).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(60000) }); if (r.ok) return (await r.json()).features; }
    catch {} await sleep(1000 * (i + 1));
  }
  return null;
}
const TYPES = /\b(STREET|ST|ROAD|RD|LANE|LN|BOULEVARD|BVD|BLVD|AVENUE|AVE|ESPLANADE|WALK|PROMENADE|PLACE|PL|CRESCENT|CR|CRES|DRIVE|DR|COURT|CT|TERRACE|TCE|PARADE|PDE|WAY|CLOSE|CL)\b/g;
export const normStreet = (s) => { const w = s.toUpperCase().replace(/['’.]/g, "").trim().split(/\s+/); if (w.length > 1 && /^(STREET|ST|ROAD|RD|LANE|LN|BOULEVARD|BVD|BLVD|AVENUE|AVE|ESPLANADE|WALK|PROMENADE|PLACE|PL|CRESCENT|CR|CRES|DRIVE|DR|COURT|CT|TERRACE|TCE|PARADE|PDE|WAY|CLOSE|CL)$/.test(w[w.length-1])) w.pop(); return w.join("").replace(/[^A-Z0-9]/g, ""); };
export function parseAddr(a) {
  const t = a.replace(/^\s*(level|lvl|l)\s*\d+[a-z]?\s*,\s*/i, "").replace(/^\s*(unit|apt|apartment|suite|u)\s+/i, "").replace(/\s*\/\s*/g, "/").replace(/\.$/, "");
  const m = t.match(/^([0-9A-Za-z]+)\/(\d+)([A-Za-z]?)(?:-\d+[A-Za-z]?)?\s+([^,]+)/);
  if (!m) return null;
  return { unit: m[1].toUpperCase(), num: +m[2], sfx: m[3].toUpperCase(), street: normStreet(m[4]), streetWord: m[4].trim().split(/\s+/)[0].toUpperCase().replace(/['’.]/g, "") };
}
export const LOCALITY = { "Melbourne CBD": "MELBOURNE", Southbank: "SOUTHBANK", Docklands: "DOCKLANDS", "St Kilda": "ST KILDA", "South Yarra": "SOUTH YARRA", "Port Melbourne": "PORT MELBOURNE", "South Wharf": "SOUTH WHARF" };
export const unitKey = (p) => `${p.blg_unit_prefix_1 ?? ""}${p.blg_unit_id_1 ?? ""}${p.blg_unit_suffix_1 ?? ""}`.toUpperCase();
