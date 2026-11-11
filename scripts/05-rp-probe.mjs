import { rp } from "./rp.mjs";
const base = { channel: "rent", searchLocation: "Docklands", searchLocationSubtext: "Suburb", type: "suburb", pageSize: "30", page: "1" };
for (const extra of [{ surroundingSuburbs: "false" }, { includeSurrounding: "false" }, { surrounding: "false" }]) {
  const r = await rp("/properties/list", { ...base, ...extra });
  const rs = r.body?.tieredResults?.[0]?.results ?? [];
  console.log(JSON.stringify(extra), r.status, "total", r.body?.totalResultsCount, "filters", JSON.stringify(r.body?.resolvedQuery?.filters), "suburbs:", [...new Set(rs.map(x=>x.address?.suburb))].join("|"), "rem", r.remaining);
}
