// Finalises research.md: staleness map (from recon_kit output) and frontmatter counts (from the memlog tally).
import { readFileSync, writeFileSync } from "node:fs";
const D = "_bmad-output/planning-artifacts/research/market-property-insights-report-value-and-buyer-2026-11-11";
const stale = JSON.parse(readFileSync(`${D}/staleness.json`, "utf8"));
const tally = JSON.parse(readFileSync(`${D}/tally.json`, "utf8"));
let s = readFileSync(`${D}/research.md`, "utf8");

const rows = [...stale.claims].sort((a, b) => a.recheck.localeCompare(b.recheck));
let table = "Windows used (months): pricing 3, feature 3, statistic 18, licence 12, regulatory 12, behavior 24. Computed with the recon_kit staleness tool on 2026-11-11.\n\n| Claim | Class | Published | Re-check by | Stale now |\n|---|---|---|---|---|\n";
for (const r of rows) table += `| ${r.claim} | ${r.class} | ${r.pub_date} | ${r.recheck} | ${r.stale ? "yes" : "no"} |\n`;
const nextFuture = rows.find((r) => !r.stale);
table += `\n**Already stale:** ${rows.filter((r) => r.stale).length} claims (Cotality terms version, REA v Domain, the 90% strata estimate). **Next re-check due:** ${nextFuture.recheck} (${nextFuture.claim}). Use Refresh to re-run these.\n`;
s = s.replace("_To be computed from the claims ledger._", table.trim());
s = s.replace("status: complete\npreset", "status: complete\nclaims_verified: " + tally.claims.verified + "\nclaims_unverified: " + tally.claims.unverified + "\npreset");
writeFileSync(`${D}/research.md`, s);
console.log("staleness rows:", rows.length, "| tally:", JSON.stringify(tally.claims));
