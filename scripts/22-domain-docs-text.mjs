// Strips the saved Domain developer-portal pages to text and prints passages about access, pricing, storage and display.
import { readFileSync, writeFileSync } from "node:fs";
const pages = { faq: "450743a2.html", terms: "e97b3b0e.html", apis: "df056333.html" };
const keys = /(pric|fee|cost|free|paid|approv|production|sandbox|quota|rate limit|package|cache|store|retain|display|attribut|commercial|sublicen|resell|redistribut|third part|property data|price estimate|valuation|AVM|building|suburb)/i;
for (const [name, f] of Object.entries(pages)) {
  let t = readFileSync(`data/raw/domain/${f}`, "utf8").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const lines = t.split("\n").map((x) => x.trim()).filter((x) => x.length > 25);
  writeFileSync(`data/raw/domain/${name}.txt`, lines.join("\n"));
  console.log(`\n===== ${name}: ${lines.length} text lines`);
  const hits = lines.filter((l) => keys.test(l)).slice(0, name === "apis" ? 30 : 45);
  for (const h of hits) console.log("-", h.slice(0, 330));
}
