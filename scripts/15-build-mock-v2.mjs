// Property Insights mock v2: ONE layout, every section answers a plain-English question.
// Real records: CRM + AirDNA, realestate.com.au (RapidAPI), Vicmap, Homes Victoria, City of Melbourne.
import { readFileSync, writeFileSync } from "node:fs";
import { parseAddr } from "./lib.mjs";

const OUT = "_bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/mockups/property-page.html";
const raw = JSON.parse(readFileSync("data/demo_raw.json", "utf8"));
const J = JSON.parse(readFileSync("data/rp_joined.json", "utf8"));
const vm = JSON.parse(readFileSync("data/vicmap_match.json", "utf8")).find((m) => m.id === raw.p.id);
const plan = JSON.parse(readFileSync("data/vicmap_planning.json", "utf8"))[`${vm.lon},${vm.lat}`];
const SUB = JSON.parse(readFileSync("data/suburb_context.json", "utf8"));
const DEV = JSON.parse(readFileSync("data/raw/suburb/com_dev_800m.json", "utf8")).results;
const { p, detail, est, ad, mb } = raw;
const TODAY = new Date("2026-11-11");

const $ = (n) => "$" + Math.round(n).toLocaleString("en-AU");
const k = (n) => "$" + Math.round(n / 1000).toLocaleString("en-AU") + "k";
const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\$?\s*([\d.]+)/); return m ? +m[1] : null; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const unitOf = (r) => parseAddr(r.address.replace(/\s*\/\s*/g, "/"))?.unit;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const monthsAgo = (d) => Math.max(0, Math.round((TODAY - new Date(d)) / (864e5 * 30.4)));
const title = (s) => String(s ?? "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/\bPs\b/g, "PS").replace(/\bSco(\d+)/g, "SCO$1");

// ---------- numbers
const inB = (r) => /\/628 Flinders/i.test(r.address ?? "");
const sold = J.filter((r) => r.ch === "sold" && inB(r)).map((r) => ({ ...r, p: num(r.price), when: new Date(r.dateSold) })).sort((a, b) => b.when - a.when);
const like = (r) => r.bed === p.bedrooms && r.bath === p.bathrooms && (r.park ?? 0) === (p.parking ?? 0);
const likeSales = sold.filter(like), saleMed = median(likeSales.map((r) => r.p));
const saleLo = Math.min(...likeSales.map((r) => r.p)), saleHi = Math.max(...likeSales.map((r) => r.p));
const whyNot = (r) => (r.bed !== p.bedrooms ? `${r.bed}-bed, not ${p.bedrooms}` : r.bath !== p.bathrooms ? `${r.bath} baths, not ${p.bathrooms}` : `${r.park} car space`);
const seen = new Set();
const rents = J.filter((r) => r.ch === "rent" && inB(r)).filter((r) => (seen.has(r.address.toLowerCase()) ? false : seen.add(r.address.toLowerCase()))).map((r) => ({ ...r, p: num(r.price), u: unitOf(r) }));
const self = rents.find((r) => r.u === "310");
const likeRents = rents.filter((r) => r.u !== "310" && r.bed === p.bedrooms && r.bath === p.bathrooms && (r.park ?? 0) === (p.parking ?? 0));
const rentMed = median(likeRents.map((r) => r.p)), rentLo = Math.min(...likeRents.map((r) => r.p)), rentHi = Math.max(...likeRents.map((r) => r.p));
const ask = +p.price, askYr = ask * 52, daysListed = Math.round((TODAY - new Date("2026-09-07")) / 864e5);
const gy = (rent, price) => ((rent * 52) / price) * 100;
const dk = SUB.dffh.Docklands, dr = SUB.rea.Docklands, da = SUB.airdna.Docklands;
const A = ad.response.data, S = A.property_statistics;
const airRev = S.revenue.ltm, airOcc = S.occupancy.ltm, airAdr = S.adr.ltm, airConf = S.confidence_score;
const ownEst = est.find((e) => e.operator_scope === "pro");
const ownMed = +ownEst.median_aud, ownP25 = +ownEst.p25_aud, ownP75 = +ownEst.p75_aud;
const comps = A.comps, near = comps.filter((c) => c.distance_meters <= 30).length, spread = ownMed - askYr;
const belowBldg = ((rentMed - ask) / rentMed) * 100, belowOfficial = ((dk.median_weekly - ask) / dk.median_weekly) * 100;
const zone = plan.zone?.[0];

// pipeline: one record per site (most advanced status wins) so a site is not counted twice
const rank = { "UNDER CONSTRUCTION": 3, APPROVED: 2, APPLIED: 1 };
const sites = new Map();
for (const r of DEV) { const key = (r.street_address ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); const cur = sites.get(key); if (!cur || rank[r.status] > rank[cur.status] || (rank[r.status] === rank[cur.status] && (r.resi_dwellings ?? 0) > (cur.resi_dwellings ?? 0))) sites.set(key, r); }
const pipe = { "UNDER CONSTRUCTION": { n: 0, d: 0 }, APPROVED: { n: 0, d: 0 }, APPLIED: { n: 0, d: 0 } };
for (const r of sites.values()) if (pipe[r.status]) { pipe[r.status].n++; pipe[r.status].d += r.resi_dwellings ?? 0; }
const pipeTotal = Object.values(pipe).reduce((a, b) => a + b.d, 0), pipeSites = Object.values(pipe).reduce((a, b) => a + b.n, 0);
const pipeTop = [...sites.values()].filter((r) => r.resi_dwellings > 0).sort((a, b) => b.resi_dwellings - a.resi_dwellings).slice(0, 4);

// ---------- small components
const chip = (kind, text) => `<span class="chip ${kind}"><i></i>${esc(text)}</span>`;
const OBS = (t = "Observed") => chip("observed", t), EST = (t = "Estimated") => chip("estimated", t), UNK = (t = "Unknown") => chip("unknown", t), CON = (t = "Conflict") => chip("conflict", t);
const tile = (label, value, chipHtml, sub = "", src = "") => `<div class="tile"><div class="cap">${esc(label)}</div><div class="fig">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}<div class="row">${chipHtml}</div>${src ? `<div class="src">${esc(src)}</div>` : ""}</div>`;
const gap = (q, why, action) => `<div class="gap"><b>${esc(q)}</b><span>${esc(why)}</span><em>Next step: ${esc(action)}</em></div>`;
const sure = (level, text) => `<div class="sure ${level}"><b>How sure are we?</b> ${chip(level === "high" ? "observed" : level === "med" ? "estimated" : "unknown", level === "high" ? "High" : level === "med" ? "Medium" : "Low")} <span>${text}</span></div>`;
const means = (t) => `<div class="means"><b>In plain English</b> ${t}</div>`;
const foot = (t) => `<div class="foot">${esc(t)}</div>`;
const sec = (id, n, q, answer, body) => `<section class="card" id="${id}" aria-labelledby="${id}-h"><div class="qhead"><span class="num" aria-hidden="true">${n}</span><div><h2 id="${id}-h">${q}</h2><p class="answer"><b>Short answer:</b> ${answer}</p></div></div>${body}</section>`;

// ---------- charts
function rentRuler() {
  const lo = 550, hi = 900, X0 = 24, X1 = 696, x = (v) => X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
  const rows = [
    { y: 34, label: `Similar units in this building (${likeRents.length} asking now)`, bar: [rentLo, rentHi], tick: rentMed, tl: `median ${$(rentMed)}` },
    { y: 84, label: `Docklands, 2-bed apartments asking now (${dr.rent2_n} listings, realestate.com.au)`, tick: dr.rent2_median, tl: `median ${$(dr.rent2_median)}` },
    { y: 134, label: `Docklands, 2-bed flats, new leases in year to Jun 2026 (Homes Victoria, ${dk.lettings.toLocaleString("en-AU")} leases)`, tick: dk.median_weekly, tl: `median ${$(dk.median_weekly)}` },
  ];
  const axis = [600, 700, 800, 900].map((v) => `<text x="${x(v)}" y="176" font-size="11" text-anchor="middle" fill="var(--ink-muted)">${$(v)}</text><line x1="${x(v)}" x2="${x(v)}" y1="20" y2="160" stroke="var(--line)" stroke-width="1"/>`).join("");
  const rs = rows.map((r) => `<text x="${X0}" y="${r.y - 8}" font-size="12" fill="var(--ink)" stroke="var(--surface)" stroke-width="5" paint-order="stroke">${esc(r.label)}</text><line x1="${X0}" x2="${X1}" y1="${r.y + 6}" y2="${r.y + 6}" stroke="var(--line)" stroke-width="2"/>${r.bar ? `<rect x="${x(r.bar[0])}" y="${r.y}" width="${x(r.bar[1]) - x(r.bar[0])}" height="12" rx="6" fill="var(--observed)" opacity=".35"/>` : ""}<rect x="${x(r.tick) - 2}" y="${r.y - 2}" width="4" height="16" fill="var(--observed)"/><text x="${x(r.tick) + 8}" y="${r.y + 18}" font-size="11" fill="var(--ink-muted)" stroke="var(--surface)" stroke-width="4" paint-order="stroke">${r.tl}</text>`).join("");
  const me = `<line x1="${x(ask)}" x2="${x(ask)}" y1="16" y2="160" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 3"/><circle cx="${x(ask)}" cy="14" r="6" fill="var(--accent)"/><text x="${x(ask) + 10}" y="18" font-size="12" font-weight="700" fill="var(--accent)">This unit: ${$(ask)}/wk</text>`;
  return `<svg viewBox="0 0 720 188" role="img" aria-label="Where this unit's asking rent of ${$(ask)} a week sits against the building, suburb asking and official median rents" style="width:100%;height:auto">${axis}${me}${rs}</svg>`;
}
function saleStrip() {
  const lo = 485000, hi = 540000, X0 = 30, X1 = 690, x = (v) => X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
  const dots = likeSales.map((r, i) => `<circle cx="${x(r.p)}" cy="62" r="8" fill="var(--observed)"/><text x="${x(r.p)}" y="${i % 2 ? 92 : 38}" font-size="11" text-anchor="middle" fill="var(--ink)">${k(r.p)}</text><text x="${x(r.p)}" y="${i % 2 ? 106 : 24}" font-size="10" text-anchor="middle" fill="var(--ink-muted)">unit ${unitOf(r)} · ${monthsAgo(r.when)} mo ago</text>`).join("");
  const axis = [490000, 500000, 510000, 520000, 530000, 540000].map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="56" y2="68" stroke="var(--line)"/><text x="${x(v)}" y="128" font-size="11" text-anchor="middle" fill="var(--ink-muted)">${k(v)}</text>`).join("");
  return `<svg viewBox="0 0 720 140" role="img" aria-label="The five like-for-like sale prices in this building, between ${k(saleLo)} and ${k(saleHi)}" style="width:100%;height:auto"><line x1="${X0}" x2="${X1}" y1="62" y2="62" stroke="var(--line)" stroke-width="3"/>${axis}<line x1="${x(saleMed)}" x2="${x(saleMed)}" y1="48" y2="76" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 3"/>${dots}</svg>`;
}
function strBars() {
  const revs = [...A.comps_revenues].sort((a, b) => a - b), maxR = Math.max(...revs), W = 600, H = 140, bw = W / revs.length, y = (v) => (v / maxR) * (H - 10);
  const bars = revs.map((v, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - y(v)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${y(v).toFixed(1)}" fill="var(--estimated)" opacity=".55"/>`).join("");
  const line = (v, dash) => `<line x1="0" x2="${W}" y1="${(H - y(v)).toFixed(1)}" y2="${(H - y(v)).toFixed(1)}" stroke="var(--ink)" stroke-width="1.5" ${dash ? 'stroke-dasharray="5 3"' : ""}/>`;
  return `<svg viewBox="0 0 ${W} ${H + 2}" role="img" aria-label="Yearly income of the 50 nearest short-stay listings, lowest to highest, against our estimate and the lease cost" style="width:100%;height:auto">${bars}${line(ownMed, false)}${line(askYr, true)}</svg><div class="key"><span><svg width="26" height="8"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--ink)" stroke-width="2"/></svg> Our estimate ${$(ownMed)}</span><span><svg width="26" height="8"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 3"/></svg> Cost of leasing it ${$(askYr)}</span><span>Each bar = one of the 50 nearest Airbnb listings, lowest to highest yearly income</span></div>`;
}
function pipeBar() {
  const W = 600, cols = { "UNDER CONSTRUCTION": "var(--observed)", APPROVED: "var(--estimated)", APPLIED: "var(--unknown)" };
  let x = 0; const segs = Object.entries(pipe).map(([s, v]) => { const w = (v.d / pipeTotal) * W; const seg = `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="22" fill="${cols[s]}" opacity=".8"/>`; x += w; return seg; }).join("");
  return `<svg viewBox="0 0 ${W} 22" preserveAspectRatio="none" role="img" aria-label="Dwellings in nearby projects by stage" style="width:100%;height:22px;border-radius:6px">${segs}</svg>`;
}

// ---------- tables
const salesRows = sold.map((r) => { const ok = like(r); return `<tr class="${ok ? "like" : "weak"}"><td>${esc(unitOf(r))}</td><td class="n">${$(r.p)}</td><td>${esc(r.dateSold)}</td><td>${r.bed} bed · ${r.bath} bath · ${r.park ?? 0} car</td><td class="why">${ok ? "Used: same layout" : "Not used: " + whyNot(r)}</td></tr>`; }).join("");
const rentRows = [...likeRents, self].sort((a, b) => a.p - b.p).map((r) => `<tr class="${r.u === "310" ? "self" : "like"}"><td>${esc(r.u)}${r.u === "310" ? " <b>(this unit)</b>" : ""}</td><td class="n">${$(r.p)}</td><td>${esc(r.dateAvailable?.dateDisplay ?? r.dateAvailable ?? "")}</td></tr>`).join("");
const yieldRows = [650, ask, 725].map((rent) => `<tr><td>${$(rent)} a week${rent === ask ? " (asking)" : ""}</td>${[saleLo, saleMed, saleHi].map((pr) => `<td class="n">${gy(rent, pr).toFixed(1)}%</td>`).join("")}</tr>`).join("");
const subs = ["Docklands", "Southbank", "Melbourne CBD", "St Kilda", "South Yarra", "Port Melbourne"];
const subRows = subs.map((s) => { const a = SUB.dffh[s], r = SUB.rea[s], m = SUB.airdna[s]; return `<tr class="${s === "Docklands" ? "self" : ""}"><td><b>${s}</b>${s === "Docklands" ? " (this unit)" : ""}</td><td class="n">${$(a.median_weekly)}</td><td class="n">${a.change_pct >= 0 ? "+" : ""}${a.change_pct.toFixed(1)}%</td><td class="n">${$(r.rent2_median)}</td><td class="n">${k(r.sold2_median)}</td><td class="n">${r.gross_yield.toFixed(1)}%</td><td class="n">${Math.round(m.occ_median)}%</td><td class="n">${$(m.adr_median_aud)}</td></tr>`; }).join("");
const overlayInfo = { PO: "Sets car-parking requirements for the precinct.", DPO: "Future development here needs an approved plan.", DDO: "Controls building design and form.", SCO: "Site-specific planning provisions apply." };
const overlays = (plan.overlays ?? []).map((o) => { const key = o.zone_code.replace(/\d+$/, ""); return `<tr><td><b>${esc(o.zone_code)}</b></td><td>${esc(title(o.zone_description))}</td><td class="why">${esc(overlayInfo[key] ?? "")}</td></tr>`; }).join("");

// ---------- plain-English summary
const summary = `This is a ${p.bedrooms}-bedroom, ${p.bathrooms}-bathroom apartment in a Docklands tower, advertised at <b>${$(ask)} a week</b> since 7 September. That is ${belowBldg.toFixed(0)}% below similar units in the same building and ${belowOfficial.toFixed(0)}% below the official Docklands median for 2-bedroom flats. The five most similar apartments that sold in the building went for <b>${k(saleLo)} to ${k(saleHi)}</b>, which puts the rent at a gross return of about <b>${gy(ask, saleMed).toFixed(1)}%</b> a year. As a short stay, estimates point to roughly <b>${$(Math.round(ownMed / 1000) * 1000)} a year</b>, and ${mb.active_listings} Airbnb listings already operate in the building. What we <b>cannot</b> tell you yet is whether the building's rules allow short stays, what the owners corporation charges, or whether the building has defects.`;

const css = `
/* Governs: DESIGN.md (tokens, evidence chips, answer-first section card) and EXPERIENCE.md (single-page IA, section nav, plain-language patterns). Spines win on conflict. */
:root{--canvas:#F3F4F0;--surface:#fff;--ink:#16202A;--ink-muted:#566270;--line:#D9DDD4;--accent:#0E5C63;--accent-fg:#fff;--accent-wash:#E1EFF0;--observed:#1F6B45;--observed-wash:#E3F1E8;--estimated:#8A5A00;--estimated-wash:#FBF0D6;--unknown:#5B4B8A;--unknown-wash:#ECE8F6;--conflict:#A3281F;--conflict-wash:#FBE5E2}
@media (prefers-color-scheme:dark){:root{--canvas:#0F161C;--surface:#17212A;--ink:#E8ECEF;--ink-muted:#9AA7B3;--line:#2B3945;--accent:#5BB8C1;--accent-fg:#0F161C;--accent-wash:#16313A;--observed:#6CCB98;--observed-wash:#16301F;--estimated:#E5B358;--estimated-wash:#33290F;--unknown:#B8A8EA;--unknown-wash:#272142;--conflict:#F08A80;--conflict-wash:#3A1B18}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.mockbar{background:var(--ink);color:var(--canvas);font-size:12px;padding:6px 16px;text-align:center}
.page{max-width:1180px;margin:0 auto;padding:16px;display:grid;grid-template-columns:200px minmax(0,1fr);gap:24px;align-items:start}
@media(max-width:1023px){.page{grid-template-columns:1fr}.toc{display:none}}
.toc{position:sticky;top:16px;font-size:13px}.toc b{display:block;margin-bottom:8px;color:var(--ink-muted);font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
.toc a{display:flex;gap:8px;padding:6px 8px;border-radius:6px;color:var(--ink);text-decoration:none}.toc a:hover,.toc a:focus-visible{background:var(--accent-wash);outline:none}
.toc span{color:var(--accent);font-weight:700;min-width:16px}
.main{display:flex;flex-direction:column;gap:20px;min-width:0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px;scroll-margin-top:16px}
h1{font:600 30px/1.15 ui-serif,Georgia,serif;margin:0 0 4px}.eyebrow{color:var(--ink-muted);font-size:13px}
h2{font:650 19px/1.3 system-ui,sans-serif;margin:0}h3{font:650 14px/1.3 system-ui,sans-serif;margin:20px 0 8px}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}.fact{border:1px solid var(--line);border-radius:9999px;padding:2px 10px;font-size:13px;color:var(--ink-muted)}
.qhead{display:flex;gap:14px;margin-bottom:16px}.num{flex:none;width:32px;height:32px;border-radius:50%;background:var(--accent);color:var(--accent-fg);display:grid;place-items:center;font-weight:700}
.answer{margin:4px 0 0;font-size:16px}
.sure,.means{margin-top:16px;padding:10px 14px;border-radius:8px;font-size:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:baseline}
.sure{background:var(--canvas);border:1px solid var(--line)}.means{background:var(--accent-wash)}.sure b,.means b{margin-right:2px}
.foot{margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-muted)}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:9999px;padding:1px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.chip i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.chip.observed{background:var(--observed-wash);color:var(--observed)}.chip.estimated{background:var(--estimated-wash);color:var(--estimated)}
.chip.unknown{background:var(--unknown-wash);color:var(--unknown)}.chip.conflict{background:var(--conflict-wash);color:var(--conflict)}
.read{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:16px}.read div{font-size:13px;color:var(--ink-muted)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px}
.cap{font-size:12px;color:var(--ink-muted);font-weight:500}.fig{font:650 24px/1.1 system-ui,sans-serif;font-variant-numeric:tabular-nums;margin:4px 0}
.tile .sub{font-size:13px;color:var(--ink-muted);margin-bottom:6px}.tile .row{margin:6px 0 4px}.src{font-size:12px;color:var(--ink-muted)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}
caption{text-align:left;font-size:13px;color:var(--ink-muted);padding-bottom:8px}
th{text-align:left;font-size:12px;color:var(--ink-muted);font-weight:600;border-bottom:1px solid var(--line);padding:6px 8px;vertical-align:bottom}
td{padding:7px 8px;border-bottom:1px solid var(--line)}td.n,th.n{text-align:right}
tr.like td:first-child{border-left:3px solid var(--observed)}tr.weak{color:var(--ink-muted)}tr.weak td:first-child{border-left:3px solid transparent}
tr.self{background:var(--accent-wash)}tr.self td:first-child{border-left:3px solid var(--accent)}
.why,.mut{color:var(--ink-muted);font-size:13px}
.gap{background:repeating-linear-gradient(135deg,var(--unknown-wash),var(--unknown-wash) 8px,transparent 8px,transparent 16px);border:1px dashed var(--unknown);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.gap b{color:var(--unknown)}.gap span{font-size:14px}.gap em{font-size:13px;color:var(--ink-muted);font-style:normal}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.grid2{grid-template-columns:1fr}}
.key{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:12px;color:var(--ink-muted);margin-top:6px}.key svg{vertical-align:middle}
.stand{margin:0;padding:0;list-style:none;display:grid;gap:8px}.stand li{display:flex;gap:10px;align-items:flex-start}.stand .chip{margin-top:2px;flex:none}
.big{font-size:16px;line-height:1.6}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.two{grid-template-columns:1fr}}
ol.q{margin:0;padding-left:22px}ol.q li{margin:8px 0}
.btn{display:inline-block;background:var(--accent);color:var(--accent-fg);border-radius:8px;padding:8px 14px;font-weight:600}.btn.o{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.note{font-size:13px;color:var(--ink-muted);margin-top:8px}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Property Insights: ${esc(p.address)} (mock)</title><style>${css}</style></head><body>
<div class="mockbar">MOCK-UP · real records from the City Retreats CRM, realestate.com.au (RapidAPI), Vicmap, Homes Victoria, City of Melbourne and AirDNA · generated ${TODAY.toISOString().slice(0, 10)}</div>
<div class="page">
<nav class="toc" aria-label="Report sections"><b>In this report</b>
<a href="#top"><span>★</span>The short version</a><a href="#s1"><span>1</span>The property</a><a href="#s2"><span>2</span>Rent</a><a href="#s3"><span>3</span>Value</a><a href="#s4"><span>4</span>Return</a><a href="#s5"><span>5</span>Airbnb</a><a href="#s6"><span>6</span>The building</a><a href="#s7"><span>7</span>The suburb</a><a href="#s8"><span>8</span>Planning</a><a href="#s9"><span>9</span>Questions to ask</a><a href="#s10"><span>10</span>Sources</a></nav>
<main class="main">

<section class="card" id="top" aria-labelledby="top-h">
  <div class="eyebrow">Docklands VIC 3008 · City of Melbourne</div>
  <h1 id="top-h">${esc(p.address)}</h1>
  <div class="facts"><span class="fact">Apartment</span><span class="fact">${p.bedrooms} bed</span><span class="fact">${p.bathrooms} bath</span><span class="fact">${p.parking} car</span><span class="fact">Asking ${$(ask)} a week</span><span class="fact">Advertised ${daysListed} days</span></div>
  <h3>The short version</h3>
  <p class="big">${summary}</p>
  <h3>What stands out</h3>
  <ul class="stand">
    <li>${OBS("Rent")}<span>Asking rent is below the building median (${$(ask)} vs ${$(rentMed)}) and the official Docklands median (${$(ask)} vs ${$(dk.median_weekly)}).</span></li>
    <li>${OBS("Value")}<span>Five like-for-like sales in this building: median ${$(saleMed)}, all within the last 6 months.</span></li>
    <li>${EST("Airbnb")}<span>Estimated ${$(ownMed)} a year, about ${$(spread)} more than the lease costs, before running costs.</span></li>
    <li>${OBS("Competition")}<span>${mb.active_listings} Airbnb listings in the building; ${pipeTotal.toLocaleString("en-AU")} new dwellings in nearby projects, mostly not yet approved or built.</span></li>
    <li>${UNK("Missing")}<span>Short-stay rules, owners corporation fees and levies, building defects, and any valuation model.</span></li>
  </ul>
  <h3>How to read this report</h3>
  <div class="read"><div>${OBS()} A recorded fact with a source and date, like a settled sale or an advertised rent.</div><div>${EST()} A model's best guess, like Airbnb income. Treat it as a range.</div><div>${UNK()} We do not have it. Shown as a hatched box, never as a zero.</div><div>${CON()} Two of our sources disagree. We show both.</div></div>
</section>

${sec("s1", 1, "What is this property?", `A ${p.bedrooms}-bed, ${p.bathrooms}-bath apartment, matched exactly to the official address record, available now.`, `
<div class="tiles">
${tile("Address", "Exact unit match", OBS(), esc(vm.ezi_address), "Vicmap Address, 11 Nov 2026")}
${tile("Official property ID", esc(vm.property_pfi), OBS(), `Council: City of Melbourne · Mesh block ${esc(vm.mesh_block)}`, "Vicmap Address")}
${tile("Advertised by", esc(detail.agent_name), OBS(), esc(detail.agency_name) + " · listed since 7 Sep 2026", "realestate.com.au and Domain")}
${tile("In our CRM", "New", OBS(), "Not yet called", "City Retreats CRM")}
</div>
<div class="note">${CON("Conflict")} Furnished: our CRM says furnished, the listing says "Furnished: no". Both are shown. Confirm with the agent.</div>
${sure("high", "The address matches an official record down to the unit number.")}
${foot("Sources: Vicmap Address (state open data), realestate.com.au via RapidAPI, City Retreats CRM.")}`)}

${sec("s2", 2, "What does it rent for, compared with the market?", `Asking ${$(ask)} a week is the second-lowest of ${likeRents.length + 1} similar units in this building, and well under the suburb medians.`, `
${rentRuler()}
<div class="grid2" style="margin-top:16px">
<table><caption>Similar units in this building asking for rent now (2 bed, 1 bath, no car)</caption><thead><tr><th>Unit</th><th class="n">Asking rent</th><th>Available</th></tr></thead><tbody>${rentRows}</tbody></table>
<div>${tile("Bond", esc(self.bond), OBS(), "About 4.3 weeks of rent", "realestate.com.au, 11 Nov 2026")}<div style="height:12px"></div>${tile("Advertised for", daysListed + " days", OBS(), "Since 7 Sep 2026. Worth asking whether the landlord will negotiate.", "Domain and realestate.com.au listing dates")}</div>
</div>
${sure("med", `These are asking rents, not signed leases. The official figure is real leases but covers all 2-bed flats in Docklands, including newer and larger towers.`)}
${means(`Compared with the market, this unit is cheap to lease. That is good if you are the tenant or operator. It may also mean the unit has something that makes it worth less, such as no car space or an older fit-out.`)}
${foot("Sources: realestate.com.au rentals via RapidAPI (11 Nov 2026); Homes Victoria Rental Report, moving annual median rent by suburb, June quarter 2026.")}`)}

${sec("s3", 3, "What is it worth?", `Similar apartments in this building sold for ${k(saleLo)} to ${k(saleHi)}. The middle price is ${$(saleMed)}.`, `
${saleStrip()}
<table style="margin-top:8px"><caption>Every sale found at 628 Flinders Street, May to Sep 2026. The five green-bar rows have the same layout as this unit.</caption><thead><tr><th>Unit</th><th class="n">Sold for</th><th>Date</th><th>Layout</th><th>Used in the middle price?</th></tr></thead><tbody>${salesRows}</tbody></table>
<div class="grid2" style="margin-top:16px">
${gap("Has unit 310 itself sold recently?", "No sale of this unit appears in the data window (May to Sep 2026).", "Check the title history at the land titles office if the last sale price matters.")}
${gap("What would a valuation model say?", "No automated valuation is connected yet.", "Connect a valuation source; it would sit beside these sales, never replace them.")}
</div>
${sure("high", "Five settled sales, same building, same layout, all within 6 months. The limit is the small number of sales.")}
${means(`This is the best evidence of what this unit would fetch. It is lower than the Docklands 2-bed median of ${k(dr.sold2_median)} (${dr.sold2_n} recent sales), so this building trades below the suburb average.`)}
${foot("Source: realestate.com.au sold listings via RapidAPI, 11 Nov 2026. Covers the newest 150 Docklands sales only, so older sales in this building are not shown.")}`)}

${sec("s4", 4, "What would the return be?", `About ${gy(ask, saleMed).toFixed(1)}% a year gross at the middle sale price and the asking rent. The net return cannot be calculated yet.`, `
<table><caption>Gross yield = a year of rent divided by the price. These rows are what-if scenarios, not evidence.</caption><thead><tr><th>If the rent is</th><th class="n">and price ${k(saleLo)}</th><th class="n">and price ${k(saleMed)} (middle)</th><th class="n">and price ${k(saleHi)}</th></tr></thead><tbody>${yieldRows}</tbody></table>
<div style="margin-top:12px">${gap("Owners corporation fees, levies and council rates: unknown", "These are deducted before you see a net return. A number without them would be invented.", "Request the owners corporation certificate from the agent.")}</div>
${sure("med", "The inputs are solid (sales and asking rent). The result is gross only, so it overstates what you would keep.")}
${means(`Gross yield is rent before any costs. For apartments, owners corporation fees can take a large share, so treat ${gy(ask, saleMed).toFixed(1)}% as a ceiling.`)}
${foot("Derived from sections 2 and 3. Labelled Derived, not Observed.")}`)}

${sec("s5", 5, "Could it work as an Airbnb?", `Estimates say about ${$(ownMed)} a year, but nothing we have shows short stays are allowed in this building.`, `
<div class="tiles">
${tile("Our estimate, per year", $(ownMed), EST("Estimated, strong"), `${$(ownP25)} to ${$(ownP75)} · ${ownEst.comps_n} same-building 2-bed 1-bath listings`, "City Retreats model, 19 Oct 2026")}
${tile("AirDNA estimate, per year", $(airRev), EST("Estimated, low confidence"), `${Math.round(airOcc * 100)}% occupied · ${$(airAdr)} a night · ${airConf.score.toFixed(0)}/100 confidence`, "AirDNA via RapidAPI, 2 Nov 2026")}
${tile("Gross spread over the lease", $(spread), EST("Estimated"), "Estimate minus a year of rent. Before cleaning, platform fees, utilities and furniture.", "Derived")}
</div>
<h3>How that compares with the 50 nearest Airbnbs</h3>
${strBars()}
<h3>What is already operating in the building</h3>
<div class="tiles">
${tile("Airbnb listings in the building", String(mb.active_listings), OBS(), `${mb.entire_homes} whole apartments · ${mb.pro_listings} run by operators with 5 or more listings`, "City Retreats building register, 2 Nov 2026")}
${tile("Typical occupancy", Number(mb.occupancy).toFixed(0) + "%", OBS(), "Median over the last 12 months", "City Retreats building register")}
${tile("City Retreats units here", String(mb.our_properties), OBS(), "Of 28 distinct units we have seen", "City Retreats CRM")}
</div>
<div class="note">${CON("Conflict")} This unit's own record says 0 Airbnb listings in the building; the building register says ${mb.active_listings}. We use the register.</div>
<div style="margin-top:12px">${gap("Are short stays allowed in this building? Unknown", "Activity is not permission. An owners corporation can ban short stays by rule, and no rule or flag is recorded for this building.", "Ask the agent and the owners corporation. Record the answer so every unit here inherits it.")}</div>
${sure("med", "Two independent estimates agree within 2%, but AirDNA rates its own estimate low. Occupancy and nightly rate are model outputs, not bookings.")}
${means(`The income looks strong, and many operators are already there. That does not tell you the building allows it. This is the single most important question to settle before committing.`)}
${foot("Sources: AirDNA rentalizer via RapidAPI (address match), City Retreats model and building register. Income in AUD.")}`)}

${sec("s6", 6, "What do we know about the building?", `Good facilities, but no financial, rules or condition records for the building.`, `
<div class="tiles">
${tile("Facilities advertised", "Pool · Gym · Spa · Sauna", OBS("Advertised"), "City views, storage", "Listing, Sep 2026")}
${tile("Address records at 628 Flinders St", "721", OBS(), "Units, car spaces and storage", "Vicmap Address")}
${tile("Units seen in our data", "28", OBS(), "Rentals, sales and Airbnb combined", "CRM")}
</div>
<div class="grid2" style="margin-top:12px">
${gap("Owners corporation fees, special levies and planned major works: unknown", "These drive holding costs and surprise bills.", "Request the owners corporation certificate and records.")}
${gap("Defects, cladding and insurance claims: unknown", "No document about this building's condition is in our data.", "Ask for the building and pest report and the last two years of owners corporation minutes.")}
</div>
${sure("low", "We have facilities and counts only. Everything that affects ongoing cost and risk is missing.")}
${means(`In an apartment, the building matters as much as the unit. This is the biggest gap in the report.`)}
${foot("Sources: listing, Vicmap Address, City Retreats CRM. No owners corporation data source is connected.")}`)}

${sec("s7", 7, "What is the suburb like?", `Docklands rents are rising (${dk.change_pct >= 0 ? "+" : ""}${dk.change_pct.toFixed(1)}% on last year), and a large pipeline of new apartments is coming nearby.`, `
<div class="tiles">
${tile("Official median rent, 2-bed flat", $(dk.median_weekly) + "/wk", OBS(), `${dk.change_pct >= 0 ? "+" : ""}${dk.change_pct.toFixed(1)}% on a year ago · ${dk.lettings.toLocaleString("en-AU")} new leases`, "Homes Victoria, year to June 2026")}
${tile("Asking rent now, 2-bed apartments", $(dr.rent2_median) + "/wk", OBS(), `${dr.rent2_n} listings in Docklands`, "realestate.com.au, 11 Nov 2026")}
${tile("Recent sales, 2-bed apartments", k(dr.sold2_median), OBS(), `Median of ${dr.sold2_n} sales (newest 150 in the suburb)`, "realestate.com.au, 11 Nov 2026")}
${tile("Gross yield, suburb", dr.gross_yield.toFixed(1) + "%", EST("Derived"), "Asking-rent median ÷ recent-sale median", "Derived")}
</div>
<h3>Airbnb in Docklands</h3>
<div class="tiles">
${tile("2-bed listings we track", da.n.toLocaleString("en-AU"), OBS(), "Docklands, entire-home and shared", "AirDNA data held in the CRM")}
${tile("Typical occupancy", Math.round(da.occ_median) + "%", EST(), "Median across those listings", "AirDNA, 2026")}
${tile("Typical nightly rate", $(da.adr_median_aud), EST(), `Converted at ${SUB.fx} AUD per USD`, "AirDNA, 2026")}
</div>
<h3>New apartments coming nearby (within 800 m)</h3>
<p style="margin:0 0 8px">${pipeSites} projects, up to <b>${pipeTotal.toLocaleString("en-AU")}</b> dwellings. Only ${pipe["UNDER CONSTRUCTION"].d.toLocaleString("en-AU")} are under construction; approval does not mean they will be built.</p>
${pipeBar()}
<div class="key"><span><b style="color:var(--observed)">■</b> Under construction ${pipe["UNDER CONSTRUCTION"].d.toLocaleString("en-AU")}</span><span><b style="color:var(--estimated)">■</b> Approved ${pipe.APPROVED.d.toLocaleString("en-AU")}</span><span><b style="color:var(--unknown)">■</b> Applied for ${pipe.APPLIED.d.toLocaleString("en-AU")}</span></div>
<table style="margin-top:12px"><caption>Largest projects nearby</caption><thead><tr><th>Site</th><th>Stage</th><th class="n">Dwellings</th><th class="n">Floors</th></tr></thead><tbody>${pipeTop.map((r) => `<tr><td>${esc(title(r.street_address.replace(/ VIC \d+/i, "")))}</td><td>${esc(title(r.status))}</td><td class="n">${r.resi_dwellings.toLocaleString("en-AU")}</td><td class="n">${r.floors_above}</td></tr>`).join("")}</tbody></table>
<h3>How Docklands compares with the other suburbs we track</h3>
<table><caption>Two-bedroom apartments. Gross yield and sale medians are indicative: they use the newest 150 sales per suburb.</caption><thead><tr><th>Suburb</th><th class="n">Official median rent</th><th class="n">Change on year</th><th class="n">Asking rent now</th><th class="n">Recent sale median</th><th class="n">Gross yield</th><th class="n">Airbnb occupancy</th><th class="n">Airbnb nightly rate</th></tr></thead><tbody>${subRows}</tbody></table>
<div class="grid2" style="margin-top:16px">
${gap("Schools, public transport, population and vacancy: not connected", "These give the demand side of the picture. They are available from free public sources and are not loaded yet.", "Add school zones, transport timetables, census data and a vacancy rate.")}
${gap("Suburb flood and heritage detail beyond this point", "Section 8 covers this exact location only.", "Add suburb-level hazard layers if investors ask.")}
</div>
${sure("med", "Official rents are real leases. Pipeline counts come from council records and can overstate (a site may have been applied for twice). Yields are indicative.")}
${means(`Rents are rising now, but a big supply of new apartments could slow that. Weigh both.`)}
${foot("Sources: Homes Victoria Rental Report (June quarter 2026); realestate.com.au via RapidAPI; City of Melbourne Development Activity Monitor (sites de-duplicated, most advanced stage kept); AirDNA data held in the CRM.")}`)}

${sec("s8", 8, "What does the planning say?", `${esc(title(zone?.zone_description))}, with ${(plan.overlays ?? []).length} overlays. This is a map screen, not a planning certificate.`, `
<div class="tiles">${tile("Planning zone", esc(zone?.zone_code ?? ""), OBS(), esc(title(zone?.zone_description)), "Vicmap Planning, 11 Nov 2026")}${tile("Flood overlay", "None returned", OBS(), "No flood or inundation overlay was returned at this point", "Vicmap Planning")}</div>
<table style="margin-top:12px"><caption>Overlays at this location</caption><thead><tr><th>Code</th><th>Name</th><th>In plain English</th></tr></thead><tbody>${overlays}</tbody></table>
${sure("med", "The location is exact, but overlay text is general. Read the schedule before relying on it.")}
${foot("Source: Vicmap Planning, point-in-polygon at the building location.")}`)}

${sec("s9", 9, "What should you ask next?", `Five questions close the biggest gaps above.`, `
<ol class="q">
<li><b>Short stays:</b> Does the owners corporation restrict short-term stays? Please send the current rules.</li>
<li><b>Costs:</b> What are the annual owners corporation fees, and are any special levies or major works planned?</li>
<li><b>Rent:</b> The unit has been advertised ${daysListed} days at ${$(ask)} a week. Will the landlord consider a longer lease or different rent?</li>
<li><b>Use:</b> Is the unit furnished, and will the landlord consent to the intended use?</li>
<li><b>Documents:</b> Can you share the owners corporation certificate and the last two years of meeting minutes?</li>
</ol>
<div class="btns"><span class="btn">Call agent</span><span class="btn o">Add to call script</span><span class="btn o">Export this report</span></div>
${foot("Generated from the gaps above. Answers are saved with a date and source, and the next unit in this building inherits them.")}`)}

${sec("s10", 10, "Where did all this come from?", `Nine sources: five give recorded facts, two give estimates, and two we still need.`, `
<table><thead><tr><th>Source</th><th>Retrieved</th><th>Match</th><th>Used in</th></tr></thead><tbody>
<tr><td>Vicmap Address (Victorian open data)</td><td>11 Nov 2026</td><td>${OBS("Exact unit")}</td><td>1, 6</td></tr>
<tr><td>Vicmap Planning</td><td>11 Nov 2026</td><td>${OBS("Exact location")}</td><td>8</td></tr>
<tr><td>realestate.com.au via RapidAPI</td><td>11 Nov 2026</td><td>${OBS("Exact unit")}</td><td>1, 2, 3, 7</td></tr>
<tr><td>Homes Victoria Rental Report</td><td>Jun quarter 2026</td><td>${OBS("Suburb")}</td><td>2, 7</td></tr>
<tr><td>City of Melbourne Development Activity Monitor</td><td>11 Nov 2026</td><td>${OBS("800 m radius")}</td><td>7</td></tr>
<tr><td>AirDNA via RapidAPI, and the CRM's AirDNA data</td><td>2 Nov 2026</td><td>${EST("Address, low conf.")}</td><td>5, 7</td></tr>
<tr><td>City Retreats model and building register</td><td>19 Oct, 2 Nov 2026</td><td>${EST("Building tier")}</td><td>5, 6</td></tr>
<tr><td>Owners corporation records</td><td>n/a</td><td>${UNK()}</td><td>4, 6</td></tr>
<tr><td>Automated valuation model</td><td>n/a</td><td>${UNK()}</td><td>3</td></tr>
</tbody></table>
${foot("realestate.com.au data comes through an unofficial third-party service. Check its terms before using it in a paid product.")}`)}

</main></div></body></html>`;

writeFileSync(OUT, html);
console.log("wrote", OUT, (html.length / 1024).toFixed(0) + " KB", { pipeSites, pipeTotal, pipe, belowBldg: belowBldg.toFixed(1), belowOfficial: belowOfficial.toFixed(1), rank: [...likeRents, self].sort((a, b) => a.p - b.p).findIndex((r) => r.u === "310") + 1, of: likeRents.length + 1 });
