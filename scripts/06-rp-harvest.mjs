import { writeFileSync } from "node:fs";
import { rp } from "./rp.mjs";
const subs = [["Melbourne CBD","Melbourne"],["Southbank","Southbank"],["Docklands","Docklands"],["St Kilda","St Kilda"],["South Yarra","South Yarra"],["Port Melbourne","Port Melbourne"]];
const out = { rent: [], sold: [] }; let calls = 0, last;
for (const [crm, loc] of subs) {
  for (const channel of ["rent", "sold"]) {
    const maxPages = channel === "sold" ? 5 : 40;
    for (let page = 1; page <= maxPages; page++) {
      const r = await rp("/properties/list", { channel, searchLocation: loc, searchLocationSubtext: "Suburb", type: "suburb", pageSize: "30", page: String(page), surroundingSuburbs: "false" });
      if (!r.cached) { calls++; await new Promise((s) => setTimeout(s, 250)); }
      if (r.status !== 200) { console.log("ERR", crm, channel, page, r.status, JSON.stringify(r.body).slice(0, 150)); break; }
      last = r.remaining;
      const rs = r.body.tieredResults?.flatMap((t) => t.results) ?? [];
      for (const x of rs) out[channel].push({ crm_suburb: crm, channel, listingId: x.listingId, ...pick(x) });
      if (page === 1) console.log(crm.padEnd(15), channel, "total reported:", r.body.totalResultsCount);
      if (rs.length < 30 || out[channel].filter(o=>o.crm_suburb===crm).length >= (r.body.totalResultsCount ?? 1e9)) break;
    }
  }
}
function pick(x) {
  return { address: x.address?.streetAddress, suburb: x.address?.suburb, postcode: x.address?.postcode, lat: x.address?.location?.latitude, lon: x.address?.location?.longitude,
    price: x.price?.display, type: x.propertyType, bed: x.generalFeatures?.bedrooms?.value ?? x.features?.general?.bedrooms, bath: x.generalFeatures?.bathrooms?.value ?? x.features?.general?.bathrooms,
    park: x.generalFeatures?.parkingSpaces?.value ?? x.features?.general?.parkingSpaces, dateSold: x.dateSold?.display ?? x.dateSold, dateAvailable: x.dateAvailable?.display ?? x.dateAvailable,
    bond: x.bond?.display ?? x.bond, modified: x.modifiedDate, agency: x.agency?.name, agent: x.listers?.[0]?.name, agentPhone: x.listers?.[0]?.mobilePhoneNumber ?? x.listers?.[0]?.phoneNumber, url: x.prettyUrl, title: x.title, furnished: /furnished/i.test(x.title + " " + (x.description ?? "")) && !/unfurnished/i.test(x.title + " " + (x.description ?? "")) };
}
writeFileSync("data/rp_harvest.json", JSON.stringify(out));
console.log("new API calls this run:", calls, "| remaining quota:", last, "| rent rows:", out.rent.length, "| sold rows:", out.sold.length);
