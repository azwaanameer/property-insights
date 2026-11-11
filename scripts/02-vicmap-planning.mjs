// For each benchmark-sample building point: Vicmap zone + overlays + parcel (by point intersect).
import { readFileSync, writeFileSync } from "node:fs";
import { wfs, cached, sleep } from "./lib.mjs";
const match = JSON.parse(readFileSync("data/vicmap_match.json", "utf8"));
const sample = JSON.parse(readFileSync("data/benchmark_addresses.json", "utf8"));
const ids = new Set(sample.map((s) => s.id));
const pts = new Map();
for (const m of match) if (ids.has(m.id) && m.lon) pts.set(`${m.lon},${m.lat}`, { lon: m.lon, lat: m.lat });
console.log("points", pts.size);
const out = {};
for (const [k, { lon, lat }] of pts) {
  const pt = `INTERSECTS(geom, SRID=4283;POINT(${lon} ${lat}))`;
  const [zone, ovl, parcel] = await Promise.all([
    cached(`pl_zone_${k}`, async () => (await wfs("plan_zone", pt, 5))?.map((f) => f.properties) ?? null),
    cached(`pl_ovl_${k}`, async () => (await wfs("plan_overlay", pt, 50))?.map((f) => f.properties) ?? null),
    cached(`pl_parcel_${k}`, async () => (await wfs("parcel_view", pt, 5))?.map((f) => f.properties) ?? null),
  ]);
  out[k] = { zone, overlays: ovl, parcel };
  await sleep(100);
}
writeFileSync("data/vicmap_planning.json", JSON.stringify(out, null, 1));
const first = Object.values(out)[0];
console.log("example zone keys:", first.zone?.[0] && Object.keys(first.zone[0]).join(","));
console.log("example overlay keys:", first.overlays?.[0] && Object.keys(first.overlays[0]).join(","));
console.log("example parcel keys:", first.parcel?.[0] && Object.keys(first.parcel[0]).join(","));
const zones = {}; Object.values(out).forEach((o) => o.zone?.forEach((z) => (zones[z.zone_code ?? z.zone_status ?? "?"] = (zones[z.zone_code ?? "?"] ?? 0) + 1)));
console.log("zones:", zones);
console.log("with parcel:", Object.values(out).filter((o) => o.parcel?.length).length, "/", pts.size);
