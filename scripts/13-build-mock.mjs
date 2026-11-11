// Builds the Property Insights key-screen mock from real records (CRM + REA via RapidAPI + Vicmap + AirDNA).
// Output: BMAD UX workspace .working/key-property-page.html  (inline CSS, system fonts, no JS, no network)
import { readFileSync, writeFileSync } from "node:fs";
import { parseAddr } from "./lib.mjs";

const WS = "_bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/.working/key-property-page.html";
const raw = JSON.parse(readFileSync("data/demo_raw.json", "utf8"));
const J = JSON.parse(readFileSync("data/rp_joined.json", "utf8"));
const vm = JSON.parse(readFileSync("data/vicmap_match.json", "utf8")).find((m) => m.id === raw.p.id);
const plan = JSON.parse(readFileSync("data/vicmap_planning.json", "utf8"))[`${vm.lon},${vm.lat}`];
const { p, detail, est, ad, mb } = raw;
const TODAY = new Date("2026-11-11");

const money = (n) => "$" + Math.round(n).toLocaleString("en-AU");
const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\$?\s*([\d.]+)/); return m ? +m[1] : null; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const unitOf = (r) => parseAddr(r.address.replace(/\s*\/\s*/g, "/"))?.unit;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const monthsAgo = (d) => Math.max(0, Math.round((TODAY - new Date(d)) / (864e5 * 30.4)));

// ---- Sales evidence (REA sold, same building 628 Flinders)
const inB = (r) => /\/628 Flinders/i.test(r.address ?? "");
const sold = J.filter((r) => r.ch === "sold" && inB(r)).map((r) => ({ ...r, p: num(r.price), when: new Date(r.dateSold) })).sort((a, b) => b.when - a.when);
const like = (r) => r.bed === p.bedrooms && r.bath === p.bathrooms && (r.park ?? 0) === (p.parking ?? 0);
const likeSales = sold.filter(like);
const saleMed = median(likeSales.map((r) => r.p)), saleLo = Math.min(...likeSales.map((r) => r.p)), saleHi = Math.max(...likeSales.map((r) => r.p));
const whyNot = (r) => (r.bed !== p.bedrooms ? `${r.bed}-bed, not ${p.bedrooms}` : r.bath !== p.bathrooms ? `${r.bath} baths, not ${p.bathrooms}` : (r.park ?? 0) !== (p.parking ?? 0) ? `${r.park} car space` : "");

// ---- Rent evidence (REA rent, same building)
const rentAll = J.filter((r) => r.ch === "rent" && inB(r));
const seen = new Set();
const rents = rentAll.filter((r) => (seen.has(r.address.toLowerCase()) ? false : seen.add(r.address.toLowerCase()))).map((r) => ({ ...r, p: num(r.price), u: unitOf(r) }));
const self = rents.find((r) => r.u === "310");
const likeRents = rents.filter((r) => r.u !== "310" && r.bed === p.bedrooms && r.bath === p.bathrooms && (r.park ?? 0) === (p.parking ?? 0));
const rentMed = median(likeRents.map((r) => r.p)), rentLo = Math.min(...likeRents.map((r) => r.p)), rentHi = Math.max(...likeRents.map((r) => r.p));
const ask = +p.price, askYr = ask * 52;
const daysListed = Math.round((TODAY - new Date("2026-09-07")) / 864e5);

// ---- Yield grid (gross only: net needs OC fees, which we do not have)
const prices = [saleLo, saleMed, saleHi], rentsGrid = [650, ask, 725];
const gy = (rent, price) => ((rent * 52) / price) * 100;

// ---- Short-stay
const A = ad.response.data, S = A.property_statistics;
const airRev = S.revenue.ltm, airOcc = S.occupancy.ltm, airAdr = S.adr.ltm, airConf = S.confidence_score;
const ownEst = est.find((e) => e.operator_scope === "pro");
const ownMed = +ownEst.median_aud, ownP25 = +ownEst.p25_aud, ownP75 = +ownEst.p75_aud;
const comps = A.comps, near = comps.filter((c) => c.distance_meters <= 30).length;
const spread = ownMed - askYr;

// ---- SVG: AirDNA comp revenue distribution (50 comps) with our markers
const revs = [...A.comps_revenues].sort((a, b) => a - b), maxR = Math.max(...revs);
const W = 560, H = 150, bw = W / revs.length;
const x = (v) => (v / maxR) * (H - 20);
const bars = revs.map((v, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - 18 - x(v)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${x(v).toFixed(1)}" fill="var(--estimated)" opacity=".55"/>`).join("");
const yLine = (v, label, dash) => `<line x1="0" x2="${W}" y1="${(H - 18 - x(v)).toFixed(1)}" y2="${(H - 18 - x(v)).toFixed(1)}" stroke="var(--ink)" stroke-width="1.2" ${dash ? 'stroke-dasharray="4 3"' : ""}/><text x="${W - 2}" y="${(H - 22 - x(v)).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--ink)">${label}</text>`;
const histSvg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Annual revenue of the 50 AirDNA comparable listings, sorted low to high, with our estimate and the lease cost marked" style="width:100%;height:auto">${bars}${yLine(ownMed, "", false)}${yLine(askYr, "", true)}</svg><div class="key"><span><svg width="26" height="8"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--ink)" stroke-width="1.5"/></svg> Our building-tier median ${money(ownMed)}</span><span><svg width="26" height="8"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"/></svg> Lease cost at asking rent ${money(askYr)}</span><span>Bars: annual revenue of the 50 AirDNA comparable listings, lowest to highest</span></div>`;

// ---- HTML helpers
const chip = (kind, text) => `<span class="chip ${kind}"><i></i>${esc(text)}</span>`;
const OBS = (t = "Observed") => chip("observed", t), EST = (t = "Estimated") => chip("estimated", t), UNK = (t = "Unknown") => chip("unknown", t), CON = (t = "Conflict") => chip("conflict", t);
const tile = (label, value, chipHtml, src, sub = "") => `<div class="tile"><div class="cap">${esc(label)}</div><div class="fig">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}<div class="row">${chipHtml}</div><div class="src">${esc(src)}</div></div>`;
const gap = (q, why, action) => `<div class="gap"><b>${esc(q)}</b><span>${esc(why)}</span><em>Next step: ${esc(action)}</em></div>`;
const foot = (t) => `<div class="foot">${esc(t)}</div>`;

const salesRows = sold.map((r) => { const ok = like(r); return `<tr class="${ok ? "like" : "weak"}"><td>${esc(r.address.replace(" Flinders Street", ""))}</td><td class="n">${money(r.p)}</td><td>${esc(r.dateSold)} <span class="mut">(${monthsAgo(r.when)} mo)</span></td><td>${r.bed}b ${r.bath}b ${r.park ?? 0}c</td><td class="why">${ok ? "Same layout, same building" : "Weaker: " + whyNot(r)}</td></tr>`; }).join("");
const rentRows = [...likeRents, self].sort((a, b) => a.p - b.p).map((r) => `<tr class="${r.u === "310" ? "self" : "like"}"><td>${esc(r.address.replace(" Flinders Street", "").replace(" Flinders St", "").replace(/ flinders street/i, ""))}${r.u === "310" ? " <b>(this unit)</b>" : ""}</td><td class="n">${money(r.p)}/wk</td><td>${esc(r.dateAvailable?.dateDisplay ?? r.dateAvailable ?? "")}</td><td>${r.bed}b ${r.bath}b ${r.park ?? 0}c</td></tr>`).join("");
const gridRows = rentsGrid.map((rent) => `<tr><td>${money(rent)}/wk${rent === ask ? " (asking)" : ""}</td>${prices.map((pr) => `<td class="n">${gy(rent, pr).toFixed(2)}%</td>`).join("")}</tr>`).join("");

const overlayInfo = { PO: "Parking Overlay: sets car-parking requirements for the precinct.", DPO: "Development Plan Overlay: future development needs an approved plan.", DDO: "Design and Development Overlay: built-form and design controls.", SCO: "Specific Controls Overlay: site-specific planning provisions." };
const overlays = (plan.overlays ?? []).map((o) => { const k = o.zone_code.replace(/\d+$/, ""); return `<li><b>${esc(o.zone_code)}</b> ${esc(o.zone_description.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()))}<span class="mut"> ${esc(overlayInfo[k] ?? "")}</span></li>`; }).join("");
const zone = plan.zone?.[0];

const head = `<title>Property Insights: ${esc(p.address)} (mock)</title>`;

const css = `
/* Governing spec: DESIGN.md (all tokens), EXPERIENCE.md (IA, Component Patterns, State Patterns, Key Flows 1-3). Spines win on conflict. */
:root{--canvas:#F3F4F0;--surface:#fff;--ink:#16202A;--ink-muted:#566270;--line:#D9DDD4;--accent:#0E5C63;--accent-fg:#fff;--observed:#1F6B45;--observed-wash:#E3F1E8;--estimated:#8A5A00;--estimated-wash:#FBF0D6;--unknown:#5B4B8A;--unknown-wash:#ECE8F6;--conflict:#A3281F;--conflict-wash:#FBE5E2}
@media (prefers-color-scheme:dark){:root{--canvas:#0F161C;--surface:#17212A;--ink:#E8ECEF;--ink-muted:#9AA7B3;--line:#2B3945;--accent:#5BB8C1;--accent-fg:#0F161C;--observed:#6CCB98;--observed-wash:#16301F;--estimated:#E5B358;--estimated-wash:#33290F;--unknown:#B8A8EA;--unknown-wash:#272142;--conflict:#F08A80;--conflict-wash:#3A1B18}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.mockbar{background:var(--ink);color:var(--canvas);font-size:12px;padding:6px 16px;text-align:center}
.wrap{max-width:1180px;margin:0 auto;padding:16px}
input.v{position:absolute;opacity:0;pointer-events:none}
header.top{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px 24px;margin-bottom:24px}
h1{font:600 28px/1.15 ui-serif,Georgia,serif;margin:0 0 4px}
.sub0{color:var(--ink-muted)}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.fact{border:1px solid var(--line);border-radius:9999px;padding:2px 10px;font-size:12px;color:var(--ink-muted)}
.tabs{display:flex;gap:4px;border:1px solid var(--line);border-radius:8px;padding:4px;width:max-content;max-width:100%;flex-wrap:wrap;margin-top:8px}
.tabs label{padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:600;color:var(--ink-muted)}
#v1:checked~header .t1,#v2:checked~header .t2,#v3:checked~header .t3{background:var(--accent);color:var(--accent-fg)}
#v1:focus-visible~header .t1,#v2:focus-visible~header .t2,#v3:focus-visible~header .t3{outline:2px solid var(--accent);outline-offset:2px}
.layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}
@media(max-width:1023px){.layout{grid-template-columns:1fr}}
.main{display:flex;flex-direction:column;gap:24px}
.rail{position:sticky;top:12px;display:flex;flex-direction:column;gap:12px}
@media(max-width:1023px){.rail{position:static}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px}
.card h2{font:650 16px/1.3 system-ui,sans-serif;margin:0 0 2px}.take{color:var(--ink-muted);margin:0 0 16px}
.foot{margin-top:14px;padding-top:10px;border-top:1px solid var(--line);font-size:12px;color:var(--ink-muted)}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:9999px;padding:1px 9px;font-size:12px;font-weight:600}
.chip i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.chip.observed{background:var(--observed-wash);color:var(--observed)}.chip.estimated{background:var(--estimated-wash);color:var(--estimated)}
.chip.unknown{background:var(--unknown-wash);color:var(--unknown)}.chip.conflict{background:var(--conflict-wash);color:var(--conflict)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.tile{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px}
.cap{font-size:12px;color:var(--ink-muted);font-weight:500}.fig{font:650 22px/1.1 system-ui,sans-serif;font-variant-numeric:tabular-nums;margin:4px 0}
.tile .sub{font-size:12px;color:var(--ink-muted);margin-bottom:6px}.tile .row{margin:6px 0 4px}.src{font-size:12px;color:var(--ink-muted)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
caption{text-align:left;font-size:12px;color:var(--ink-muted);padding-bottom:6px}
th{text-align:left;font-size:12px;color:var(--ink-muted);font-weight:600;border-bottom:1px solid var(--line);padding:6px 8px}
td{padding:7px 8px;border-bottom:1px solid var(--line)}td.n,th.n{text-align:right}
tr.like td:first-child{border-left:3px solid var(--observed)}tr.weak{color:var(--ink-muted)}tr.weak td:first-child{border-left:3px solid transparent}
tr.self{background:var(--estimated-wash)}tr.self td:first-child{border-left:3px solid var(--estimated)}
.why,.mut{color:var(--ink-muted);font-size:12px}
.gap{background:repeating-linear-gradient(135deg,var(--unknown-wash),var(--unknown-wash) 8px,transparent 8px,transparent 16px);border:1px dashed var(--unknown);border-radius:8px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;color:var(--ink)}
.gap b{color:var(--unknown)}.gap span{font-size:13px}.gap em{font-size:12px;color:var(--ink-muted);font-style:normal}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:700px){.two{grid-template-columns:1fr}}
ul.ov{margin:8px 0 0;padding-left:18px}ul.ov li{margin:4px 0}
ol.q{margin:0;padding-left:20px}ol.q li{margin:6px 0}
.btn{display:inline-block;background:var(--accent);color:var(--accent-fg);border-radius:8px;padding:8px 14px;font-weight:600}
.btn.o{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.note{font-size:12px;color:var(--ink-muted);margin-top:8px}
.key{display:flex;gap:6px 16px;flex-wrap:wrap;font-size:12px;color:var(--ink-muted);margin-top:6px}.key svg{vertical-align:middle}
.legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
/* view switch: section order + rail variants (CSS-only) */
.s-str{order:1}.s-bldg{order:2}.s-rent{order:3}.s-sales{order:4}.s-yield{order:5}.s-plan{order:6}.s-q{order:7}.s-src{order:8}
#v2:checked~.layout .s-sales{order:1}#v2:checked~.layout .s-rent{order:2}#v2:checked~.layout .s-yield{order:3}#v2:checked~.layout .s-bldg{order:4}#v2:checked~.layout .s-str{order:5}
#v3:checked~.layout .s-sales{order:1}#v3:checked~.layout .s-yield{order:2}#v3:checked~.layout .s-rent{order:3}#v3:checked~.layout .s-plan{order:4}#v3:checked~.layout .s-bldg{order:5}#v3:checked~.layout .s-str{order:6}
.r2,.r3{display:none}#v2:checked~.layout .r1,#v3:checked~.layout .r1{display:none}#v2:checked~.layout .r2{display:flex}#v3:checked~.layout .r3{display:flex}
.rail>div{flex-direction:column;gap:12px}.r1{display:flex}
`;

const rail1 = `<div class="rail r1">
  ${tile("Short-stay income, per year", money(ownMed), EST("Estimated, strong"), "Our building-tier estimate: 14 same-building 2-bed 1-bath listings, 19 Oct 2026", `${money(ownP25)} to ${money(ownP75)} (25th to 75th percentile)`)}
  ${tile("Lease cost at asking rent, per year", money(askYr), OBS(), "Advertised on realestate.com.au, 11 Nov 2026", `${money(ask)}/wk · bond ${esc(self.bond)}`)}
  ${tile("Gross spread before running costs", money(spread), EST("Estimated"), "Short-stay estimate minus lease cost. Excludes cleaning, platform fees, utilities, furniture.")}
  ${gap("Building short-stay rules: unknown", "No owners corporation rule or flag is recorded for 628 Flinders Street.", "Ask the agent or owners corporation before committing.")}
  <div class="btns"><span class="btn">Call agent</span><span class="btn o">Mark outcome</span></div>
</div>`;
const rail2 = `<div class="rail r2">
  ${tile("Like-for-like sales, same building", money(saleMed), OBS("Observed, median of " + likeSales.length), "Settled sales reported on realestate.com.au, May to Sep 2026", `Range ${money(saleLo)} to ${money(saleHi)}`)}
  ${tile("Gross yield at median sale and asking rent", gy(ask, saleMed).toFixed(2) + "%", EST("Derived"), `${money(askYr)} advertised rent ÷ ${money(saleMed)} median sale. Not a forecast.`)}
  ${tile("Asking rent vs building median", money(ask) + "/wk", OBS(), `Building median for the same layout: ${money(rentMed)}/wk (${likeRents.length} listings)`)}
  ${gap("Net yield: owners corporation fees unknown", "Fees, levies and planned works are not in any connected source.", "Request the owners corporation certificate.")}
  <div class="btns"><span class="btn">Export report</span><span class="btn o">Edit offer price</span></div>
</div>`;
const rail3 = `<div class="rail r3">
  ${tile("Indicative value basis", money(saleMed), OBS("Observed, median of " + likeSales.length), "Comparable settled sales only. No automated valuation is connected.", `Range ${money(saleLo)} to ${money(saleHi)}`)}
  ${tile("Rent assumption", money(ask) + "/wk", OBS("Advertised"), "Not an actual lease. Building median " + money(rentMed) + "/wk.", `${money(askYr)} per year`)}
  ${gap("Automated valuation: not connected", "A model estimate would sit beside the comparable sales, never replace them.", "Connect a valuation source.")}
  ${gap("Lender valuation", "The lender's own valuation decides lending value.", "Order through the lender.")}
  <div class="btns"><span class="btn">Export client brief</span></div>
</div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}<style>${css}</style></head><body>
<div class="mockbar">MOCK-UP · real records from the City Retreats CRM, realestate.com.au (via RapidAPI), Vicmap and AirDNA · generated ${TODAY.toISOString().slice(0, 10)}</div>
<div class="wrap">
<input class="v" type="radio" name="view" id="v1" checked aria-label="Acquisition view"><input class="v" type="radio" name="view" id="v2" aria-label="Investor view"><input class="v" type="radio" name="view" id="v3" aria-label="Broker view">
<header class="top">
  <div class="sub0">Docklands VIC 3008 · City of Melbourne</div>
  <h1>${esc(p.address)}</h1>
  <div class="facts"><span class="fact">Apartment</span><span class="fact">${p.bedrooms} bed</span><span class="fact">${p.bathrooms} bath</span><span class="fact">${p.parking} car</span><span class="fact">Listed since 7 Sep 2026 · ${daysListed} days</span><span class="fact">Agent: ${esc(detail.agent_name)}, ${esc(detail.agency_name)}</span><span class="fact">CRM status: New</span></div>
  <div class="legend">${OBS("Observed: recorded fact with source and date")}${EST("Estimated: model or provider estimate")}${UNK("Unknown: not in any connected source")}${CON("Conflict: our sources disagree")}</div>
  <div class="tabs" role="tablist" aria-label="View"><label class="t1" for="v1">Acquisition</label><label class="t2" for="v2">Investor</label><label class="t3" for="v3">Broker</label></div>
</header>
<div class="layout">
<main class="main">

<section class="card s-sales" aria-labelledby="h-sales"><h2 id="h-sales">Sales evidence: this building</h2>
<p class="take">${likeSales.length} like-for-like settled sales (same layout, same building, last 6 months): median ${money(saleMed)}, range ${money(saleLo)} to ${money(saleHi)}.</p>
<table><caption>Settled sales at 628 Flinders Street found in the newest 150 Docklands sales, May to Sep 2026. No sale of unit 310 appears in this window.</caption>
<thead><tr><th>Unit</th><th class="n">Sold for</th><th>Date</th><th>Layout</th><th>Relevance</th></tr></thead><tbody>${salesRows}</tbody></table>
<div class="note">Layout key: beds, baths, car spaces. The ${money(760000)} sale has a second bathroom and a car space, so it is shown but excluded from the median.</div>
${foot("Source: realestate.com.au sold listings via RapidAPI (realty-in-au), retrieved 11 Nov 2026. Match: exact building, unit-level addresses. Coverage: newest 150 sales in the suburb only; older sales would need deeper paging or another source.")}</section>

<section class="card s-rent" aria-labelledby="h-rent"><h2 id="h-rent">Rent evidence: this building</h2>
<p class="take">Asking ${money(ask)}/wk is ${ask < rentMed ? "below" : "above"} the building median of ${money(rentMed)}/wk for the same layout (${likeRents.length} current listings, range ${money(rentLo)} to ${money(rentHi)}). The unit has been advertised for ${daysListed} days.</p>
<table><caption>Advertised rents for 2-bed, 1-bath, no-car units at 628 Flinders Street. These are asking rents, not signed leases.</caption>
<thead><tr><th>Unit</th><th class="n">Asking rent</th><th>Available</th><th>Layout</th></tr></thead><tbody>${rentRows}</tbody></table>
<div class="two" style="margin-top:12px">${tile("Bond", esc(self.bond), OBS(), "realestate.com.au, 11 Nov 2026")}${tile("Bond check", "Consistent", OBS(), "Bond ≈ 4.3 weeks of asking rent")}</div>
${foot("Source: realestate.com.au rental listings via RapidAPI (realty-in-au), 11 Nov 2026; the same unit and rent also appear in the CRM from Domain (matching). Suburb bond-based rent benchmark (Homes Victoria) is not yet connected.")}</section>

<section class="card s-yield" aria-labelledby="h-yield"><h2 id="h-yield">Gross yield scenarios</h2>
<p class="take">At the building's like-for-like sale prices and the asking rent, gross yield is ${gy(ask, saleHi).toFixed(1)}% to ${gy(ask, saleLo).toFixed(1)}%. Net yield cannot be shown yet.</p>
<table><caption>Gross yield = annual rent ÷ price. Inputs are scenarios you can edit; they are not evidence.</caption>
<thead><tr><th>Weekly rent</th><th class="n">At ${money(saleLo)}</th><th class="n">At ${money(saleMed)} (median)</th><th class="n">At ${money(saleHi)}</th></tr></thead><tbody>${gridRows}</tbody></table>
<div style="margin-top:12px">${gap("Owners corporation fees, levies and rates: unknown", "Net yield and any holding-cost figure would be invented without them.", "Request the owners corporation certificate from the agent.")}</div>
${foot("Derived from the two sections above. Labelled: Derived, not Observed.")}</section>

<section class="card s-str" aria-labelledby="h-str"><h2 id="h-str">Short-stay scenario</h2>
<p class="take">Two estimates agree within 2%: AirDNA ${money(airRev)} (low confidence) and our building-tier ${money(ownMed)}. Observed activity in the building is heavy, but nothing here shows short stays are permitted.</p>
<div class="tiles">
${tile("AirDNA estimate, per year", money(airRev), EST("Estimated, low confidence"), "AirDNA rentalizer via RapidAPI, 2 Nov 2026", `${Math.round(airOcc * 100)}% occupancy · ${money(airAdr)} average nightly rate · confidence ${airConf.score.toFixed(0)}/100 · ${comps.length} comps (${near} within 30 m)`)}
${tile("Our building-tier estimate, per year", money(ownMed), EST("Estimated, strong"), "City Retreats model, 19 Oct 2026", `${money(ownP25)} to ${money(ownP75)} · ${ownEst.comps_n} same-building 2-bed 1-bath listings, professional-operator scope`)}
</div>
<div style="margin-top:16px">${histSvg}</div>
<div class="two" style="margin-top:16px">
${tile("Airbnb listings in this building", String(mb.active_listings), OBS("Observed"), "City Retreats building register, last seen 2 Nov 2026", `${mb.entire_homes} entire homes · ${mb.pro_listings} run by operators with 5 or more listings · median occupancy ${Number(mb.occupancy).toFixed(1)}%`)}
${tile("City Retreats units already in the building", String(mb.our_properties), OBS("Observed"), "CRM, 28 distinct units seen in the building")}
</div>
<div class="note" style="margin-top:10px">${CON("Conflict")} This unit's own record says 0 Airbnb listings in the building, but the building register shows ${mb.active_listings}. The register is used here; the unit record needs a refresh.</div>
<div style="margin-top:12px">${gap("Are short stays permitted in this building? Unknown", "Observed Airbnb activity is not permission. Owners corporations can ban short stays by rule; no rule or flag is recorded for this building.", "Ask the agent and the owners corporation; record the answer so every unit here inherits it.")}</div>
${foot("Sources: AirDNA (fetched 2 Nov 2026, address match to this unit), City Retreats model, CRM building register. Nightly rate and occupancy are model outputs, not bookings.")}</section>

<section class="card s-bldg" aria-labelledby="h-bldg"><h2 id="h-bldg">Building and unit identity</h2>
<p class="take">The unit is matched to an official address record. Building rules and financials are not.</p>
<div class="tiles">
${tile("Official address match", "Exact unit", OBS(), "Vicmap Address, 11 Nov 2026", esc(vm.ezi_address))}
${tile("Vicmap property ID", esc(vm.property_pfi), OBS(), "Vicmap Address", `Mesh block ${esc(vm.mesh_block)}`)}
${tile("Building facilities", "Pool · Gym · Spa · Sauna", OBS("Advertised"), "Listing amenities, Sep 2026", "City views · storage")}
</div>
<div class="two" style="margin-top:12px">
${gap("Owners corporation fees, special levies, major works: unknown", "These drive holding cost and surprise bills.", "Request the owners corporation certificate and records.")}
${gap("Defects, cladding, building insurance claims: unknown", "No document from this building is in our data.", "Ask for the building and pest report and owners corporation minutes.")}
</div>
<div class="note" style="margin-top:10px">${CON("Conflict")} Furnished: the CRM says furnished, the listing says "Furnished: no". Both are shown; confirm with the agent.</div>
${foot("Vicmap Address lists 721 address records at 628 Flinders Street (units, car spaces and storage). The unit matches exactly.")}</section>

<section class="card s-plan" aria-labelledby="h-plan"><h2 id="h-plan">Planning screen</h2>
<p class="take">${esc(zone?.zone_description ? zone.zone_description.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : "")} with ${(plan.overlays ?? []).length} overlays at this location. This is a map screen, not a planning certificate.</p>
<div class="tiles">${tile("Zone", esc(zone?.zone_code ?? ""), OBS(), "Vicmap Planning, 11 Nov 2026", esc(zone?.zone_description ?? ""))}${tile("Council", "City of Melbourne", OBS(), "Vicmap Address, council code " + esc(vm.lga_code))}</div>
<ul class="ov">${overlays}</ul>
${foot("Source: Vicmap Planning, point-in-polygon at the building location. Overlay explanations are general; confirm the schedule text before relying on it. No flood overlay (LSIO) was returned at this point.")}</section>

<section class="card s-q" aria-labelledby="h-q"><h2 id="h-q">Questions to take to the agent</h2>
<p class="take">Each question closes a gap shown above.</p>
<ol class="q">
<li>Does the owners corporation restrict short-term stays, by rule or by-law? Please send the current rules.</li>
<li>What are the annual owners corporation fees, and are any special levies or major works planned?</li>
<li>The unit has been advertised for ${daysListed} days at ${money(ask)}/wk. Is the landlord open to a longer lease or a lower rent?</li>
<li>Is the unit furnished, and will the landlord consent to the intended use?</li>
<li>Can you share the owners corporation certificate and the last two years of meeting minutes?</li>
</ol>
<div class="btns"><span class="btn">Add to call script</span></div>
${foot("Generated from the gaps in this report. Answers are recorded with a date and source.")}</section>

<section class="card s-src" aria-labelledby="h-src"><h2 id="h-src">Sources and data quality</h2>
<p class="take">Every figure above traces to one of these.</p>
<table><thead><tr><th>Source</th><th>Retrieved</th><th>Match</th><th>Used for</th></tr></thead><tbody>
<tr><td>Vicmap Address (state open data)</td><td>11 Nov 2026</td><td>${OBS("Exact unit")}</td><td>Identity, property ID, council</td></tr>
<tr><td>Vicmap Planning</td><td>11 Nov 2026</td><td>${OBS("Point")}</td><td>Zone and overlays</td></tr>
<tr><td>realestate.com.au via RapidAPI</td><td>11 Nov 2026</td><td>${OBS("Exact unit")}</td><td>Sales, rents, bond, agent</td></tr>
<tr><td>AirDNA via RapidAPI</td><td>2 Nov 2026</td><td>${EST("Address, low conf.")}</td><td>Short-stay estimate, 50 comps</td></tr>
<tr><td>City Retreats model and building register</td><td>19 Oct and 2 Nov 2026</td><td>${EST("Building tier")}</td><td>Own estimate, Airbnb activity</td></tr>
<tr><td>Owners corporation records</td><td>n/a</td><td>${UNK()}</td><td>Not connected</td></tr>
<tr><td>Automated valuation (e.g. Microburbs)</td><td>n/a</td><td>${UNK()}</td><td>Not connected; key needed</td></tr>
</tbody></table></section>

</main>
<aside aria-label="Summary">${rail1}${rail2}${rail3}</aside>
</div></div></body></html>`;

writeFileSync(WS, html);
console.log("wrote", WS, (html.length / 1024).toFixed(0) + " KB");
console.log({ likeSales: likeSales.length, saleMed, saleLo, saleHi, likeRents: likeRents.length, rentMed, rentLo, rentHi, askYr, spread, yieldMed: gy(ask, saleMed).toFixed(2), daysListed, near });
