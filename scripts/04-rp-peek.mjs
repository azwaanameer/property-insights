import { rp } from "./rp.mjs";
for (const channel of ["rent", "sold"]) {
  const r = await rp("/properties/list", { channel, searchLocation: "Docklands", searchLocationSubtext: "Suburb", type: "suburb", pageSize: "30", page: "1" });
  const b = r.body; console.log("\n##", channel, r.status, "remaining", r.remaining, "total", b.totalResultsCount, "tiers", b.tieredResults?.map(t=>t.tier+":"+t.results?.length));
  const first = b.tieredResults?.[0]?.results?.[0]; console.log(JSON.stringify(first, null, 0).slice(0, 2200));
}
