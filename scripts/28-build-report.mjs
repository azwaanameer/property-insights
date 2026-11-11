// VicProp Property Insight Report: premium multi-skin mock-up (investor / renter / buyer views).
// Run from repo root: node scripts/28-build-report.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { parseAddr } from "./lib.mjs";

const OUTDIR = "_bmad-output/planning-artifacts/ux-designs/ux-property-insights-2026-11-11/mockups/";
const BRAND = "VicProp"; // working name, change here
// CLI: node scripts/28-build-report.mjs [--pdf] [--skin midnight|ledger|atlas|eucalypt|monolith] [--view investor|renter|buyer]
const ARGS = process.argv.slice(2);
const argv = (n, d) => { const i = ARGS.indexOf(n); return i >= 0 ? ARGS[i + 1] : d; };
const PDF = ARGS.includes("--pdf"), SKIN = argv("--skin", "midnight"), VIEW = argv("--view", "investor");
const CALC = { price: null, dep: 20, rate: 6.2, vac: 2, costs: 5500, years: 10 }; // example inputs, not data
const raw = JSON.parse(readFileSync("data/demo_raw.json", "utf8"));
const J = JSON.parse(readFileSync("data/rp_joined.json", "utf8"));
const vm = JSON.parse(readFileSync("data/vicmap_match.json", "utf8")).find((m) => m.id === raw.p.id);
const plan = JSON.parse(readFileSync("data/vicmap_planning.json", "utf8"))[`${vm.lon},${vm.lat}`];
const SUB = JSON.parse(readFileSync("data/suburb_context.json", "utf8"));
const DEV = JSON.parse(readFileSync("data/raw/suburb/com_dev_800m.json", "utf8")).results;
const G = JSON.parse(readFileSync("data/vgv_unit_growth.json", "utf8"));
const SC = JSON.parse(readFileSync("data/screen_indicative.json", "utf8"));
const PD = JSON.parse(readFileSync("data/price_drivers.json", "utf8"));
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
const sgn = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d) + "%";

// ---------- numbers (same logic as mock v2)
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
const spread = ownMed - askYr;
const belowBldg = ((rentMed - ask) / rentMed) * 100, belowOfficial = ((dk.median_weekly - ask) / dk.median_weekly) * 100;
const zone = plan.zone?.[0];
const rentRank = [...likeRents, self].sort((a, b) => a.p - b.p).findIndex((r) => r.u === "310") + 1;

// supply pipeline (one record per site, most advanced stage wins)
const rank = { "UNDER CONSTRUCTION": 3, APPROVED: 2, APPLIED: 1 };
const sites = new Map();
for (const r of DEV) { const key = (r.street_address ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""); const cur = sites.get(key); if (!cur || rank[r.status] > rank[cur.status] || (rank[r.status] === rank[cur.status] && (r.resi_dwellings ?? 0) > (cur.resi_dwellings ?? 0))) sites.set(key, r); }
const pipe = { "UNDER CONSTRUCTION": { n: 0, d: 0 }, APPROVED: { n: 0, d: 0 }, APPLIED: { n: 0, d: 0 } };
for (const r of sites.values()) if (pipe[r.status]) { pipe[r.status].n++; pipe[r.status].d += r.resi_dwellings ?? 0; }
const pipeTotal = Object.values(pipe).reduce((a, b) => a + b.d, 0), pipeSites = Object.values(pipe).reduce((a, b) => a + b.n, 0);
const pipeTop = [...sites.values()].filter((r) => r.resi_dwellings > 0).sort((a, b) => b.resi_dwellings - a.resi_dwellings).slice(0, 5);

// Valuer-General growth
const DKG = G.DOCKLANDS, histG = +DKG.cagr5.toFixed(1);
// Domain building page capture (supplied by Azwaan, 11 Nov 2026)
const DOM = { forSale: 21, same: 7, lastSale: 445000, lastSaleUnit: "413", lastSaleDate: "9 Nov 2026", held10: -2.55, rentedPct: 55, asks: [["917", "$370,000 to $390,000", "Offers Welcome"], ["2514", "$420,000 to $450,000", ""], ["1017", "$485,000 to $525,000", ""], ["1914", "$510,000 to $540,000", ""]] };
const mid = Math.round(saleMed / 1000) * 1000;
const yMid = gy(ask, saleMed);

// ---------- small components
const chip = (kind, text) => `<span class="chip ${kind}"><i></i>${esc(text)}</span>`;
const OBS = (t = "Observed") => chip("observed", t), EST = (t = "Estimated") => chip("estimated", t), UNK = (t = "Unknown") => chip("unknown", t), CON = (t = "Conflict") => chip("conflict", t);
const tile = (label, value, chipHtml, sub = "", src = "") => `<div class="tile"><div class="cap">${esc(label)}</div><div class="fig${/[A-Za-z]{3,}/.test(String(value).replace(/<[^>]*>/g, "")) ? " t" : ""}">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}<div class="row">${chipHtml}</div>${src ? `<div class="src">${esc(src)}</div>` : ""}</div>`;
const gap = (q, why, action) => `<div class="gap"><b>${esc(q)}</b><span>${esc(why)}</span><em>Next step: ${esc(action)}</em></div>`;
const sure = (level, text) => `<div class="sure"><b>How sure are we?</b> ${chip(level === "high" ? "observed" : level === "med" ? "estimated" : "unknown", level === "high" ? "High" : level === "med" ? "Medium" : "Low")} <span>${text}</span></div>`;
const means = (t) => `<div class="means"><b>In plain English</b><span>${t}</span></div>`;
const foot = (t) => `<div class="foot"><b>Sources</b> ${esc(t)}</div>`;
const part = (letter, name, line) => `<header class="part" id="part-${letter.toLowerCase()}"><span class="pl">${letter}</span><div><h2 class="pt">${esc(name)}</h2><p>${esc(line)}</p></div></header>`;
const sec = (id, n, q, answer, lv, body) => `<section class="card sec" id="${id}" data-i="${lv[0]}" data-r="${lv[1]}" data-b="${lv[2]}" aria-labelledby="${id}-h"><div class="qhead"><span class="num" aria-hidden="true">${n}</span><div class="qtxt"><div class="qline"><span class="tag" aria-hidden="true"></span></div><h3 id="${id}-h">${q}</h3><p class="answer"><b>Short answer.</b> ${answer}</p></div></div>${body}</section>`;

// ---------- illustrations
function skyline() {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const W = 560, H = 270, base = 232;
  const layer = (n, minH, maxH, op, x0, x1) => { let s = "", x = x0; while (x < x1) { const w = 20 + rnd() * 30, h = minH + rnd() * (maxH - minH); s += `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--hero-ink)" opacity="${op}"/>`; x += w + 2 + rnd() * 5; } return s; };
  const sx = 318, sw = 54, sh = 196;
  const win = (x, y, w, h) => { let s = ""; for (let yy = y + 8; yy < y + h - 6; yy += 9) for (let xx = x + 6; xx < x + w - 6; xx += 8) if (rnd() > 0.28) s += `<rect x="${xx}" y="${yy}" width="3.6" height="4.6" fill="var(--hero-bg)" opacity="${(0.35 + rnd() * 0.5).toFixed(2)}"/>`; return s; };
  return `<svg viewBox="0 0 ${W} ${H}" class="sky" role="img" aria-label="Illustration of a Docklands apartment tower beside the Yarra waterfront"><defs><linearGradient id="sk" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--hero-ink)" stop-opacity=".0"/><stop offset="1" stop-color="var(--hero-ink)" stop-opacity=".16"/></linearGradient></defs>
<rect width="${W}" height="${H}" fill="url(#sk)"/>
${layer(0, 40, 120, 0.10, 6, W)}${layer(1, 60, 150, 0.17, 0, W)}${layer(2, 30, 105, 0.26, 10, W)}
<rect x="${sx}" y="${base - sh}" width="${sw}" height="${sh}" fill="var(--accent2)"/><rect x="${sx + sw}" y="${base - sh + 14}" width="14" height="${sh - 14}" fill="var(--accent2)" opacity=".7"/><rect x="${sx + 20}" y="${base - sh - 14}" width="14" height="14" fill="var(--accent2)"/>${win(sx, base - sh, sw, sh)}
<g transform="translate(${sx - 6} ${base - sh - 30})"><rect width="92" height="20" rx="3" fill="var(--hero-ink)"/><text x="46" y="14" font-size="11" font-weight="600" text-anchor="middle" fill="var(--hero-bg)" style="font-family:var(--f-body)">628 Flinders St</text></g>
<rect y="${base}" width="${W}" height="${H - base}" fill="var(--hero-ink)" opacity=".12"/>
<path d="M0 ${base + 14} q 35 -7 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0" stroke="var(--hero-ink)" stroke-opacity=".35" fill="none" stroke-width="1.5"/>
<path d="M0 ${base + 27} q 35 -7 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0 t 70 0" stroke="var(--hero-ink)" stroke-opacity=".2" fill="none" stroke-width="1.5"/></svg>`;
}
function logo(size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="var(--accent)"/><path d="M6 17 16 8l10 9" stroke="var(--accent-ink)" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="21" width="3.4" height="5" fill="var(--accent-ink)"/><rect x="14.3" y="18" width="3.4" height="8" fill="var(--accent-ink)"/><rect x="19.6" y="15" width="3.4" height="11" fill="var(--accent-ink)"/></svg>`;
}

// ---------- charts
function rentRuler() {
  const lo = 550, hi = 900, X0 = 24, X1 = 696, x = (v) => X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
  const rows = [
    { y: 44, label: `Similar units in this building (${likeRents.length} asking now)`, bar: [rentLo, rentHi], tick: rentMed, tl: `median ${$(rentMed)}` },
    { y: 94, label: `Docklands 2-bed apartments asking now (${dr.rent2_n} listings)`, tick: dr.rent2_median, tl: `median ${$(dr.rent2_median)}` },
    { y: 144, label: `Docklands 2-bed flats, new leases to Jun 2026 (${dk.lettings.toLocaleString("en-AU")} leases)`, tick: dk.median_weekly, tl: `median ${$(dk.median_weekly)}` },
  ];
  const axis = [600, 700, 800, 900].map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="26" y2="168" stroke="var(--line)"/><text x="${x(v)}" y="188" font-size="11" text-anchor="middle" fill="var(--ink2)">${$(v)}</text>`).join("");
  const rs = rows.map((r) => `<text x="${X0}" y="${r.y - 9}" font-size="12" fill="var(--ink)" stroke="var(--paper)" stroke-width="5" paint-order="stroke">${esc(r.label)}</text><line x1="${X0}" x2="${X1}" y1="${r.y + 6}" y2="${r.y + 6}" stroke="var(--line)" stroke-width="2"/>${r.bar ? `<rect x="${x(r.bar[0])}" y="${r.y}" width="${x(r.bar[1]) - x(r.bar[0])}" height="12" rx="6" fill="var(--obs)" opacity=".35"/>` : ""}<rect x="${x(r.tick) - 2}" y="${r.y - 2}" width="4" height="16" fill="var(--obs)"/><text x="${x(r.tick) + 8}" y="${r.y + 19}" font-size="11" fill="var(--ink2)" stroke="var(--paper)" stroke-width="4" paint-order="stroke">${r.tl}</text>`).join("");
  const me = `<line x1="${x(ask)}" x2="${x(ask)}" y1="20" y2="168" stroke="var(--accent2)" stroke-width="2.2" stroke-dasharray="5 3"/><circle cx="${x(ask)}" cy="16" r="6" fill="var(--accent2)"/><text x="${x(ask) + 11}" y="20" font-size="12" font-weight="700" fill="var(--ink)">This unit ${$(ask)}/wk</text>`;
  return `<svg viewBox="0 0 720 198" role="img" aria-label="Asking rent of ${$(ask)} a week against the building, suburb asking and official median rents" style="width:100%;height:auto">${axis}${me}${rs}</svg>`;
}
function saleStrip() {
  const lo = 435000, hi = 545000, X0 = 30, X1 = 690, x = (v) => X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
  const pts = [...likeSales.map((r) => ({ p: r.p, unit: unitOf(r), ago: `${monthsAgo(r.when)} mo ago`, col: "var(--obs)" })), { p: DOM.lastSale, unit: DOM.lastSaleUnit, ago: "2 days ago", col: "var(--unk)" }].sort((a, b) => a.p - b.p);
  const CY = 82;
  const dots = pts.map((q, i) => { const up = i % 2 === 0; return `<circle cx="${x(q.p)}" cy="${CY}" r="8" fill="${q.col}"/><text x="${x(q.p)}" y="${up ? CY - 26 : CY + 32}" font-size="11.5" font-weight="700" text-anchor="middle" fill="var(--ink)">${k(q.p)}</text><text x="${x(q.p)}" y="${up ? CY - 40 : CY + 45}" font-size="10" text-anchor="middle" fill="var(--ink2)">unit ${q.unit}</text><text x="${x(q.p)}" y="${up ? CY - 53 : CY + 58}" font-size="10" text-anchor="middle" fill="var(--ink2)">${q.ago}</text>`; }).join("");
  const axis = [450000, 475000, 500000, 525000].map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${CY - 6}" y2="${CY + 6}" stroke="var(--line)"/><text x="${x(v)}" y="170" font-size="11" text-anchor="middle" fill="var(--ink2)">${k(v)}</text>`).join("");
  return `<svg viewBox="0 0 720 178" role="img" aria-label="Like-for-like sale prices in this building from ${k(DOM.lastSale)} to ${k(saleHi)}" style="width:100%;height:auto"><line x1="${X0}" x2="${X1}" y1="${CY}" y2="${CY}" stroke="var(--line)" stroke-width="3"/>${axis}<line x1="${x(saleMed)}" x2="${x(saleMed)}" y1="${CY - 16}" y2="${CY + 16}" stroke="var(--accent2)" stroke-width="2.4" stroke-dasharray="4 3"/>${dots}</svg><div class="key"><span><b style="color:var(--obs)">●</b> Sold, realestate.com.au</span><span><b style="color:var(--unk)">●</b> Sold, Domain building page (not in our set)</span><span><svg width="26" height="8"><line x1="0" x2="26" y1="4" y2="4" stroke="var(--accent2)" stroke-width="2.2" stroke-dasharray="4 3"/></svg> Middle of the five realestate.com.au sales, ${$(saleMed)}</span></div>`;
}
function driverBars() {
  const eff = (n) => PD.effects.find((e) => e.driver === n);
  const items = [["Second bedroom (vs 1 bed)", eff("2 bed (vs 1)")], ["Second bathroom (vs 1)", eff("2+ baths (vs 1)")], ["Has a car space", eff("has car space")], ["Port Melbourne (vs CBD)", eff("suburb:Port Melbourne")], ["Docklands (vs CBD)", eff("suburb:Docklands")], ["Floor 30+ (vs floors 1 to 9)", eff("floor 30+")], ["Floor 10 to 19 (vs 1 to 9)", eff("floor 10-19 (vs 1-9)")]];
  const L = 214, R = 20, W = 640, lo = -10, hi = 40, x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R), rowH = 34;
  const grid = [-10, 0, 10, 20, 30, 40].map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="6" y2="${items.length * rowH + 8}" stroke="${v === 0 ? "var(--ink2)" : "var(--line)"}"/><text x="${x(v)}" y="${items.length * rowH + 26}" font-size="11" text-anchor="middle" fill="var(--ink2)">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%</text>`).join("");
  const bars = items.map(([lab, e], i) => { const v = +e.effect_pct, se = +e.se_pct, y = 12 + i * rowH, weak = Math.abs(v) < 2 * se; const x0 = x(Math.min(0, v)), w = Math.abs(x(v) - x(0));
    return `<text x="${L - 12}" y="${y + 14}" font-size="12.5" text-anchor="end" fill="var(--ink)">${lab}</text><rect x="${x0}" y="${y}" width="${w}" height="18" rx="2" fill="${weak ? "var(--ink2)" : "var(--accent)"}" opacity="${weak ? 0.4 : 0.95}"/><line x1="${x(v - 2 * se)}" x2="${x(v + 2 * se)}" y1="${y + 9}" y2="${y + 9}" stroke="var(--accent2)" stroke-width="2.6"/><line x1="${x(v - 2 * se)}" x2="${x(v - 2 * se)}" y1="${y + 4}" y2="${y + 14}" stroke="var(--accent2)" stroke-width="2.6"/><line x1="${x(v + 2 * se)}" x2="${x(v + 2 * se)}" y1="${y + 4}" y2="${y + 14}" stroke="var(--accent2)" stroke-width="2.6"/><text x="${x(Math.max(v + 2 * se, 0)) + 8}" y="${y + 14}" font-size="12" font-weight="600" fill="var(--ink)">${sgn(v)}${weak ? " (not clear)" : ""}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${items.length * rowH + 34}" role="img" aria-label="Estimated effect of each feature on apartment sale price, with error bars" style="width:100%;height:auto">${grid}${bars}</svg>`;
}
function historyChart() {
  const names = [["DOCKLANDS", "Docklands", "var(--accent)", 3], ["SOUTHBANK", "Southbank", "var(--ink2)", 1.6], ["MELBOURNE", "Melbourne CBD", "var(--est)", 1.6], ["FRANKSTON", "Frankston", "var(--obs)", 1.6], ["DANDENONG", "Dandenong", "var(--unk)", 1.6]];
  const yrs = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  const all = names.flatMap(([key]) => yrs.map((y) => G[key].series[y]).filter(Boolean));
  const lo = Math.floor(Math.min(...all) / 100000) * 100000, hi = Math.ceil(Math.max(...all) / 100000) * 100000;
  const W = 760, H = 300, L = 62, R = 168, T = 14, B = 34, X = (y) => L + ((y - 2015) / 10) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let s = ""; for (let v = lo; v <= hi; v += 100000) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="var(--ink2)">${k(v)}</text>`;
  for (const y of yrs) if ((y - 2015) % 2 === 0) s += `<text x="${X(y)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="var(--ink2)">${y}</text>`;
  const ends = [];
  for (const [key, lab, col, sw] of names) { const pts = yrs.filter((y) => G[key].series[y]).map((y) => [X(y), Y(G[key].series[y])]); s += `<path d="${pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ")}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="round"/>`; const last = pts.at(-1); s += `<circle cx="${last[0]}" cy="${last[1]}" r="${sw > 2 ? 4.5 : 3.2}" fill="${col}"/>`; ends.push({ lab, col, y: last[1], v: G[key].series[2025], bold: sw > 2 }); }
  ends.sort((a, b) => a.y - b.y); for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  for (const e of ends) s += `<text x="${W - R + 10}" y="${e.y + 4}" font-size="12" font-weight="${e.bold ? 700 : 500}" fill="var(--ink)">${e.lab} ${k(e.v)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Median unit price by year 2015 to 2025 for Docklands, Southbank, Melbourne CBD, Frankston and Dandenong" style="width:100%;height:auto">${s}</svg>`;
}
function sitePlan() {
  const lat0 = vm.lat, lon0 = vm.lon, C = 190, scale = 150 / 800;
  const toXY = (r) => [C + (r.longitude - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180) * scale, C + (lat0 - r.latitude) * 110574 * scale];
  const col = { "UNDER CONSTRUCTION": "var(--obs)", APPROVED: "var(--est)", APPLIED: "var(--unk)" };
  const rings = [200, 400, 600, 800].map((m) => `<circle cx="${C}" cy="${C}" r="${m * scale}" fill="none" stroke="var(--line)" stroke-dasharray="${m === 800 ? "" : "3 4"}" stroke-width="${m === 800 ? 1.6 : 1}"/><text x="${(C - m * scale * 0.7071 - 3).toFixed(1)}" y="${(C - m * scale * 0.7071 - 3).toFixed(1)}" font-size="10" text-anchor="end" fill="var(--ink2)" stroke="var(--paper)" stroke-width="3" paint-order="stroke">${m} m</text>`).join("");
  const pts = [...sites.values()].filter((r) => r.latitude && r.resi_dwellings > 0).map((r) => ({ r, xy: toXY(r) })).sort((a, b) => b.r.resi_dwellings - a.r.resi_dwellings);
  const topIdx = new Map(pipeTop.map((r, i) => [r.street_address, i + 1]));
  const dots = pts.map(({ r, xy }) => `<circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${(4 + Math.sqrt(r.resi_dwellings) / 2.4).toFixed(1)}" fill="${col[r.status]}" fill-opacity=".55" stroke="${col[r.status]}" stroke-width="1.5"><title>${esc(title(r.street_address))}: ${r.resi_dwellings} dwellings, ${esc(title(r.status))}</title></circle>`).join("");
  const lab = pts.filter(({ r }) => topIdx.has(r.street_address)).map(({ r, xy }) => `<text x="${xy[0].toFixed(1)}" y="${(xy[1] + 3.8).toFixed(1)}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink)" style="font-family:var(--f-mono)">${topIdx.get(r.street_address)}</text>`).join("");
  const me = `<circle cx="${C}" cy="${C}" r="9" fill="var(--accent2)" stroke="var(--paper)" stroke-width="3"/><text x="${C}" y="${C + 26}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink)" stroke="var(--paper)" stroke-width="4" paint-order="stroke">628 Flinders St</text>`;
  const north = `<g transform="translate(350 26)"><path d="M0 14 L6 -6 L12 14 L6 9 Z" fill="var(--ink)"/><text x="6" y="-11" font-size="11" font-weight="700" text-anchor="middle" fill="var(--ink)">N</text></g>`;
  return `<svg viewBox="0 0 380 380" role="img" aria-label="Site plan: nearby apartment projects within 800 metres of the property, sized by dwellings and coloured by stage" style="width:100%;height:auto;max-width:460px">${rings}${dots}${lab}${me}${north}</svg>`;
}
const L26 = SC.filter((o) => o.sales >= 60 && o.cagr5 != null);
{ const rk = (key) => { const s = [...L26].sort((x, y) => y[key] - x[key]); s.forEach((o, i) => (o["r_" + key] = i / (L26.length - 1))); }; rk("cagr5"); rk("yield"); L26.forEach((o) => (o.score = 1 - (o.r_cagr5 + o.r_yield) / 2)); }
function scatter() {
  const yMin = Math.floor(Math.min(...L26.map((o) => o.yield)) - 0.3);
  const W = 700, H = 420, L = 56, R = 20, T = 18, B = 48, x0 = -3, x1 = 6.5, y0 = yMin, y1 = 7;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R), Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let s = ""; for (let v = Math.ceil(y0); v <= 7; v += 1) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 8}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="var(--ink2)">${v}%</text>`;
  for (let v = -2; v <= 6; v += 2) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}" stroke="${v === 0 ? "var(--ink2)" : "var(--line)"}"/><text x="${X(v)}" y="${H - B + 18}" font-size="11" text-anchor="middle" fill="var(--ink2)">${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}%</text>`;
  s += `<text x="${(L + W - R) / 2}" y="${H - 8}" font-size="12" text-anchor="middle" fill="var(--ink)">Unit price growth, 5-year average a year (Valuer-General medians)</text><text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" font-size="12" text-anchor="middle" fill="var(--ink)">Gross rental yield</text>`;
  s += `<text x="${W - R - 6}" y="${T + 14}" font-size="11.5" font-weight="600" text-anchor="end" fill="var(--obs)">More growth and more income</text><text x="${L + 8}" y="${T + 14}" font-size="11.5" font-weight="600" fill="var(--ink2)">Income, little growth</text><text x="${W - R - 6}" y="${H - B - 8}" font-size="11.5" font-weight="600" text-anchor="end" fill="var(--ink2)">Growth, lower income</text>`;
  const lab = { DOCKLANDS: [-9, -9, "end"], SOUTHBANK: [10, -6, "start"], "SOUTH YARRA": [10, 16, "start"], "ST KILDA": [-10, -8, "end"], "PORT MELBOURNE": [10, 14, "start"], "SOUTH MELBOURNE": [10, 4, "start"], FRANKSTON: [0, -14, "middle"], DANDENONG: [12, 4, "start"], "NOBLE PARK": [0, -14, "middle"], CRAIGIEBURN: [0, 24, "middle"] };
  const ours = new Set(["DOCKLANDS", "SOUTHBANK", "SOUTH YARRA", "ST KILDA", "PORT MELBOURNE", "MELBOURNE"]);
  for (const o of [...L26].sort((a, b) => b.sales - a.sales)) { const isD = o.sub === "DOCKLANDS", isO = ours.has(o.sub); const r = Math.min(13, 3 + Math.sqrt(o.sales) / 1.6);
    s += `<circle cx="${X(o.cagr5)}" cy="${Y(o.yield)}" r="${r.toFixed(1)}" fill="${isD ? "var(--accent2)" : isO ? "var(--accent)" : "var(--ink2)"}" fill-opacity="${isD ? 0.95 : isO ? 0.7 : 0.35}" stroke="${isD ? "var(--ink)" : isO ? "var(--accent)" : "var(--ink2)"}" stroke-width="1.2"><title>${esc(title(o.sub))}: ${sgn(o.cagr5)} a year, yield ${o.yield.toFixed(1)}%, ${o.sales} sales in the quarter</title></circle>`; }
  for (const [name, [dx, dy, anc]] of Object.entries(lab)) { const o = L26.find((q) => q.sub === name); if (!o) continue; s += `<text x="${X(o.cagr5) + dx}" y="${Y(o.yield) + dy}" font-size="11.5" font-weight="${name === "DOCKLANDS" ? 700 : 600}" text-anchor="${anc}" fill="var(--ink)" stroke="var(--paper)" stroke-width="4" paint-order="stroke">${esc(title(name))}</text>`; }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Suburbs plotted by five-year unit price growth against gross rental yield" style="width:100%;height:auto">${s}</svg>`;
}

// ---------- tables
const salesRows = sold.map((r) => { const ok = like(r); return `<tr class="${ok ? "like" : "weak"}"><td>${esc(unitOf(r))}</td><td class="n">${$(r.p)}</td><td>${esc(r.dateSold)}</td><td>${r.bed} bed · ${r.bath} bath · ${r.park ?? 0} car</td><td class="why">${ok ? "Used: same layout" : "Not used: " + whyNot(r)}</td></tr>`; }).join("");
const rentRows = [...likeRents, self].sort((a, b) => a.p - b.p).map((r) => `<tr class="${r.u === "310" ? "self" : "like"}"><td>${esc(r.u)}${r.u === "310" ? " <b>(this unit)</b>" : ""}</td><td class="n">${$(r.p)}</td><td>${esc(r.dateAvailable?.dateDisplay ?? r.dateAvailable ?? "")}</td></tr>`).join("");
const yieldCols = [[DOM.lastSale, "Latest Domain sale"], [saleLo, "Lowest realestate.com.au sale"], [saleMed, "Middle"], [saleHi, "Highest"]];
const yieldRows = [650, ask, 725].filter((v, i, a) => a.indexOf(v) === i).map((rent) => `<tr class="${rent === ask ? "self" : ""}"><td>${$(rent)} a week${rent === ask ? " (asking)" : ""}</td>${yieldCols.map(([pr]) => `<td class="n">${gy(rent, pr).toFixed(1)}%</td>`).join("")}</tr>`).join("");
const subs = ["Docklands", "Southbank", "Melbourne CBD", "St Kilda", "South Yarra", "Port Melbourne"];
const vgKey = { Docklands: "DOCKLANDS", Southbank: "SOUTHBANK", "Melbourne CBD": "MELBOURNE", "St Kilda": "ST KILDA", "South Yarra": "SOUTH YARRA", "Port Melbourne": "PORT MELBOURNE" };
const subRows = subs.map((s) => { const a = SUB.dffh[s], r = SUB.rea[s], m = SUB.airdna[s], g = G[vgKey[s]]; return `<tr class="${s === "Docklands" ? "self" : ""}"><td><b>${s}</b></td><td class="n">${$(a.median_weekly)}</td><td class="n">${sgn(a.change_pct)}</td><td class="n">${k(g.latest_2025)}</td><td class="n">${sgn(g.cagr5)}</td><td class="n">${r.gross_yield.toFixed(1)}%</td><td class="n">${Math.round(m.occ_median)}%</td><td class="n">${$(m.adr_median_aud)}</td></tr>`; }).join("");
const screenRows = [...L26].sort((a, b) => b.score - a.score).slice(0, 10).map((o) => `<tr><td><b>${esc(title(o.sub))}</b></td><td class="n">${k(o.price)}</td><td class="n">${sgn(o.cagr5)}</td><td class="n">${sgn(o.cagr10)}</td><td class="n">${o.yield.toFixed(1)}%</td><td class="n">${o.rent_cagr5 == null ? "n/a" : sgn(o.rent_cagr5)}</td><td class="n">${o.sales}</td></tr>`).join("");
const dkScreen = L26.find((o) => o.sub === "DOCKLANDS");
const dkRank = [...L26].sort((a, b) => b.score - a.score).findIndex((o) => o.sub === "DOCKLANDS") + 1;
const overlayInfo = { PO: "Sets car-parking requirements for the precinct.", DPO: "Future development here needs an approved plan.", DDO: "Controls building design and form.", SCO: "Site-specific planning provisions apply." };
const overlays = (plan.overlays ?? []).map((o) => { const key = o.zone_code.replace(/\d+$/, ""); return `<tr><td><b>${esc(o.zone_code)}</b></td><td>${esc(title(o.zone_description))}</td><td class="why">${esc(overlayInfo[key] ?? "")}</td></tr>`; }).join("");
const layoutRows = Object.entries(PD.layouts).filter(([, v]) => v.n >= 20).sort((a, b) => a[1].median - b[1].median).map(([lay, v]) => { const m = lay.match(/^(\d)b (\d\+?)ba (car|no car)$/); const name = m ? `${m[1]} bed · ${m[2]} bath · ${m[3] === "car" ? "with car" : "no car"}` : lay; const isUs = m && m[1] === "2" && m[2] === "1" && m[3] === "no car"; return `<tr class="${isUs ? "self" : ""}"><td>${name}${isUs ? " <b>(this unit)</b>" : ""}</td><td class="n">${$(v.median)}</td><td class="n">${v.n}</td></tr>`; }).join("");

// ---------- reader-specific copy
const v_inv = `<h3>Investor snapshot</h3><p class="lead">Income is solid and the entry price is falling, but this market has not grown in ten years. The case rests on yield and a good purchase price, not on capital growth.</p><ul class="pts"><li>${OBS("Yield")}<span>About <b>${yMid.toFixed(1)}%</b> gross at the middle sale price; <b>${gy(ask, DOM.lastSale).toFixed(1)}%</b> if the latest Domain sale (${k(DOM.lastSale)}) is the right comparison.</span></li><li>${OBS("Growth")}<span>Docklands unit prices moved <b>${sgn(DKG.cagr5)} a year</b> over five years and <b>${sgn(DKG.cagr10)}</b> over ten. This building's recent sales show <b>${sgn(DOM.held10, 2)}</b> a year over ten years.</span></li><li>${OBS("Competition")}<span><b>${DOM.same} of ${DOM.forSale}</b> homes for sale here are the same layout, and asking prices start at $370,000.</span></li><li>${EST("Short stay")}<span>Estimated <b>${$(ownMed)}</b> a year, about ${$(spread)} more than the lease costs, before running costs. Rules in the building are unknown.</span></li></ul>`;
const v_ren = `<h3>Renter snapshot</h3><p class="lead">At ${$(ask)} a week this is cheaper than most similar apartments in the building, and it has been advertised for ${daysListed} days, which gives you room to negotiate.</p><ul class="pts"><li>${OBS("Price")}<span><b>${belowBldg.toFixed(0)}% below</b> the building median (${$(rentMed)}) and <b>${belowOfficial.toFixed(0)}% below</b> the official Docklands median for new 2-bed leases (${$(dk.median_weekly)}). Second-lowest of ${likeRents.length + 1} similar units.</span></li><li>${OBS("Trend")}<span>Docklands rents rose <b>${sgn(dk.change_pct)}</b> in the past year, so expect a rise at renewal.</span></li><li>${OBS("Upfront")}<span>Bond ${esc(self.bond)}. Furnishing is disputed: the listing says unfurnished.</span></li><li>${UNK("Unknown")}<span>Lease length, building noise, how many neighbours run short stays (${mb.active_listings} Airbnb listings operate here), and building condition.</span></li></ul>`;
const v_buy = `<h3>Buyer snapshot (to live in)</h3><p class="lead">You would be buying below what the same layout cost in this building a few months ago, and below where it sold ten years ago, with plenty of choice.</p><ul class="pts"><li>${OBS("Price")}<span>Similar units sold for <b>${k(DOM.lastSale)} to ${k(saleHi)}</b> in the past six months. ${DOM.same} are for sale now, from $370,000.</span></li><li>${OBS("Ten years")}<span>The latest sale in the building (unit ${DOM.lastSaleUnit}) was <b>${k(DOM.lastSale)}</b>, against $582,000 paid in June 2016.</span></li><li>${EST("Who lives here")}<span>About <b>${DOM.rentedPct}%</b> of homes are rented, an estimate from Domain. Expect fewer owner-occupiers and more turnover.</span></li><li>${UNK("Unknown")}<span>Owners corporation fees, special levies, defects and the building's rules. These decide whether it is a comfortable place to own.</span></li></ul>`;

// ---------- skins
const SKINS = {
  ledger: { name: "Ledger", note: "Navy and brass. A formal report for investors and lenders.", sw: "#12305A", css: `--bg:#E9ECF1;--paper:#fff;--paper2:#F4F6F9;--ink:#0E1A2B;--ink2:#52607A;--line:#D6DCE6;--rule:#0E1A2B;--accent:#12305A;--accent-ink:#fff;--accent2:#B08A3E;--wash:#E4EAF4;--hero-bg:#0B2447;--hero-ink:#F4EBD8;--hero-ink2:#B9C4D8;--obs:#17694A;--obs-w:#E2F2EA;--est:#8A5A00;--est-w:#FBF0D6;--unk:#5B4B8A;--unk-w:#ECE8F6;--con:#A3281F;--con-w:#FBE5E2;--r:6px;--r2:3px;--bw:1px;--sh:0 1px 2px rgba(14,26,43,.06),0 8px 24px rgba(14,26,43,.06);--f-display:'Newsreader',Georgia,serif;--f-body:'Inter',system-ui,sans-serif;--f-mono:'IBM Plex Mono',ui-monospace,monospace;--dw:600;--dt:none;--dls:-.01em` },
  atlas: { name: "Atlas", note: "Bright white and teal. Modern and approachable for renters and first-home buyers.", sw: "#0F766E", css: `--bg:#EEF4F4;--paper:#fff;--paper2:#F3F8F8;--ink:#10201F;--ink2:#4F6665;--line:#D5E3E2;--rule:#0F766E;--accent:#0F766E;--accent-ink:#fff;--accent2:#F2A33A;--wash:#DDF1EF;--hero-bg:#E3F4F1;--hero-ink:#0B3B38;--hero-ink2:#3C6B67;--obs:#12714B;--obs-w:#DDF3E8;--est:#8F5B00;--est-w:#FCEFD0;--unk:#5E4CA3;--unk-w:#ECE7F9;--con:#B3261E;--con-w:#FCE4E1;--r:16px;--r2:10px;--bw:1px;--sh:0 1px 2px rgba(16,32,31,.05),0 12px 32px rgba(15,118,110,.10);--f-display:'Manrope',system-ui,sans-serif;--f-body:'Inter',system-ui,sans-serif;--f-mono:'IBM Plex Mono',ui-monospace,monospace;--dw:800;--dt:none;--dls:-.025em` },
  midnight: { name: "Midnight", note: "Dark slate with gold. Premium, easy on the eyes, good for screens at night.", sw: "#E2B65C", css: `color-scheme:dark;--bg:#0A101C;--paper:#111A2B;--paper2:#16213A;--ink:#E8EDF6;--ink2:#9BA9C2;--line:#243350;--rule:#E2B65C;--accent:#E2B65C;--accent-ink:#1A1405;--accent2:#6FB4FF;--wash:#1B2944;--hero-bg:#0E1729;--hero-ink:#EAF0FA;--hero-ink2:#9BA9C2;--obs:#6DD3A0;--obs-w:#12302A;--est:#F0BE5A;--est-w:#33290E;--unk:#B9A9F0;--unk-w:#272047;--con:#FF8F85;--con-w:#3B1C1A;--r:10px;--r2:6px;--bw:1px;--sh:0 1px 0 rgba(255,255,255,.04) inset,0 18px 40px rgba(0,0,0,.35);--f-display:'Space Grotesk',system-ui,sans-serif;--f-body:'Inter',system-ui,sans-serif;--f-mono:'IBM Plex Mono',ui-monospace,monospace;--dw:600;--dt:none;--dls:-.02em` },
  eucalypt: { name: "Eucalypt", note: "Deep green and ochre. Calm and grounded, suits long-term owners.", sw: "#1F5D43", css: `--bg:#E6ECE5;--paper:#FBFCFA;--paper2:#F0F4EF;--ink:#14241B;--ink2:#53665A;--line:#CBD7C9;--rule:#1F5D43;--accent:#1F5D43;--accent-ink:#fff;--accent2:#C9772B;--wash:#DCE9DE;--hero-bg:#163D2D;--hero-ink:#F1F5EC;--hero-ink2:#B5CBB9;--obs:#1B6A3E;--obs-w:#DFF0E3;--est:#8A5600;--est-w:#FAEFD3;--unk:#5C4B8C;--unk-w:#EAE6F5;--con:#A62A20;--con-w:#FBE4E0;--r:10px;--r2:6px;--bw:1px;--sh:0 1px 2px rgba(20,36,27,.06),0 10px 28px rgba(20,36,27,.08);--f-display:'Fraunces',Georgia,serif;--f-body:'Inter',system-ui,sans-serif;--f-mono:'IBM Plex Mono',ui-monospace,monospace;--dw:600;--dt:none;--dls:-.015em` },
  monolith: { name: "Monolith", note: "Black, white and cobalt. Hard rules and sharp corners, like a data terminal.", sw: "#1530E6", css: `--bg:#ECECEA;--paper:#fff;--paper2:#F4F4F2;--ink:#0A0A0A;--ink2:#4D4D4D;--line:#0A0A0A;--rule:#0A0A0A;--accent:#1530E6;--accent-ink:#fff;--accent2:#FF8A00;--wash:#E3E7FF;--hero-bg:#0A0A0A;--hero-ink:#FFFFFF;--hero-ink2:#BDBDBD;--obs:#0B6B3A;--obs-w:#D9F2E3;--est:#7A4B00;--est-w:#FFEBC2;--unk:#52389E;--unk-w:#E9E2FA;--con:#B00020;--con-w:#FFDDE2;--r:0px;--r2:0px;--bw:2px;--sh:none;--f-display:'IBM Plex Sans',system-ui,sans-serif;--f-body:'IBM Plex Sans',system-ui,sans-serif;--f-mono:'IBM Plex Mono',ui-monospace,monospace;--dw:700;--dt:uppercase;--dls:.01em` },
};
const skinCss = Object.entries(SKINS).map(([id, s]) => (id === "ledger" ? `:root{${s.css}}\n:root[data-skin="ledger"]{${s.css}}` : `:root[data-skin="${id}"]{${s.css}}`)).join("\n");
const relLabels = { investor: "Key for investors", renter: "Key for renters", buyer: "Key for buyers" };
const relCss = Object.entries({ investor: "i", renter: "r", buyer: "b" }).map(([v, a]) => `:root[data-view="${v}"] .sec[data-${a}="core"] .tag::before{content:"${relLabels[v]}";background:var(--accent);color:var(--accent-ink)}:root[data-view="${v}"] .sec[data-${a}="ctx"] .tag::before{content:"Background";background:transparent;color:var(--ink2);border:var(--bw) solid var(--line)}:root[data-view="${v}"] .sec[data-${a}="off"] .tag::before{content:"Less relevant to you";background:transparent;color:var(--ink2);border:var(--bw) dashed var(--line)}:root[data-view="${v}"] .sec[data-${a}="off"] .qtxt{opacity:.78}`).join("\n");

const css = `
/* Layout: sticky toolbar, full-bleed cover with key-figure strip, then a contents rail beside lettered report parts. Tokens come from the active skin. */
${skinCss}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 var(--f-body);-webkit-font-smoothing:antialiased}
.wrapx{padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.in{max-width:1260px;margin:0 auto}
a{color:var(--accent)}
.mono,.fig,.num,td.n,.pl{font-family:var(--f-mono)}
/* toolbar */
.bar{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:var(--paper);border-bottom:var(--bw) solid var(--line)}
.bar .in{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding-block:10px}
.brand{display:flex;align-items:center;gap:10px;font:var(--dw) 19px/1 var(--f-display);letter-spacing:var(--dls);text-transform:var(--dt);color:var(--ink)}
.brand small{font:500 11px/1.2 var(--f-body);color:var(--ink2);letter-spacing:.08em;text-transform:uppercase;display:block;margin-top:3px}
.sp{flex:1}
.seg{display:flex;border:var(--bw) solid var(--line);border-radius:var(--r2);overflow:hidden}
.seg button{all:unset;cursor:pointer;padding:7px 13px;font:600 13px/1 var(--f-body);color:var(--ink2);border-right:var(--bw) solid var(--line);white-space:nowrap}
.seg button:last-child{border-right:0}
.seg button[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink)}
.seg button:focus-visible,.sk:focus-visible,.btn:focus-visible,.pill:focus-visible{outline:2px solid var(--accent2);outline-offset:2px}
.lab{font:600 11px/1 var(--f-body);letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);margin-right:6px}
.skins{display:flex;align-items:center;gap:6px}
.sk{all:unset;cursor:pointer;width:26px;height:26px;border-radius:50%;border:2px solid var(--paper);box-shadow:0 0 0 1px var(--line);position:relative}
.sk[aria-pressed="true"]{box-shadow:0 0 0 2px var(--ink)}
#skin-name{font:600 12px/1 var(--f-body);color:var(--ink);min-width:62px}
.mock{background:var(--accent2);color:#111;font:600 12px/1 var(--f-body);padding:6px 10px;text-align:center;letter-spacing:.02em}
/* cover */
.cover{background:var(--hero-bg);color:var(--hero-ink);position:relative;overflow:hidden}
.cover .in{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:32px;align-items:end;padding-block:44px 92px}
@media(max-width:900px){.cover .in{grid-template-columns:1fr;padding-block:32px 84px}}
.kick{font:600 12px/1.3 var(--f-body);letter-spacing:.14em;text-transform:uppercase;color:var(--hero-ink2);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.kick b{color:var(--accent2)}
h1{font:var(--dw) clamp(32px,4.6vw,54px)/1.04 var(--f-display);letter-spacing:var(--dls);text-transform:var(--dt);margin:14px 0 8px;text-wrap:balance}
.sub1{font-size:17px;color:var(--hero-ink2);margin:0 0 20px;max-width:46ch}
.facts{display:flex;flex-wrap:wrap;gap:8px}
.fact{border:1px solid color-mix(in srgb,var(--hero-ink) 35%,transparent);border-radius:999px;padding:3px 12px;font-size:13px;color:var(--hero-ink)}
.cover-art{align-self:end}.sky{width:100%;height:auto;display:block}
.cap-art{font-size:11px;color:var(--hero-ink2);margin-top:6px;text-align:right}
/* key figures strip */
.keys{margin-top:-62px;position:relative;z-index:2}
.keys .grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));background:var(--paper);border:var(--bw) solid var(--line);border-top:4px solid var(--accent2);border-radius:var(--r);box-shadow:var(--sh)}
@media(max-width:1100px){.keys .grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:560px){.keys .grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.kf{padding:16px 16px 14px;border-right:var(--bw) solid var(--line);border-bottom:var(--bw) solid var(--line);min-width:0}
.kf .cap{font:600 11px/1.3 var(--f-body);letter-spacing:.07em;text-transform:uppercase;color:var(--ink2)}
.kf .big{font:var(--dw) 28px/1.1 var(--f-display);letter-spacing:var(--dls);margin:6px 0 4px;font-variant-numeric:tabular-nums}
.kf .s{font-size:12.5px;color:var(--ink2);line-height:1.4;margin-bottom:8px}
/* summary */
.sum{margin-top:28px;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:20px}
@media(max-width:900px){.sum{grid-template-columns:1fr}}
.panel{background:var(--paper);border:var(--bw) solid var(--line);border-radius:var(--r);padding:24px;min-width:0}
.panel h3{font:var(--dw) 13px/1.3 var(--f-body);letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin:0 0 10px}
.lead{font:var(--dw) 21px/1.35 var(--f-display);letter-spacing:var(--dls);margin:0 0 14px;text-wrap:pretty;text-transform:none}
.pts{list-style:none;margin:0;padding:0;display:grid;gap:10px}.pts li{display:flex;gap:10px;align-items:flex-start}.pts .chip{margin-top:3px;flex:none}
.vp{display:none}:root[data-view="investor"] .vp-i,:root[data-view="renter"] .vp-r,:root[data-view="buyer"] .vp-b{display:block}
.legend h3{margin-bottom:12px}.legend .it{display:grid;gap:10px;font-size:13.5px}.legend .it div{display:flex;gap:10px;align-items:flex-start}.legend .chip{flex:none;margin-top:1px}
.skinbox{margin-top:16px;padding-top:14px;border-top:var(--bw) solid var(--line);font-size:13px;color:var(--ink2)}
/* layout */
.page{padding-block:30px 60px}
.pg{display:grid;grid-template-columns:210px minmax(0,1fr);gap:32px;align-items:start}
@media(max-width:1023px){.pg{grid-template-columns:1fr}.toc{display:none}}
.toc{position:sticky;top:calc(env(safe-area-inset-top,0px) + 78px);font-size:13px;max-height:calc(100vh - 100px);overflow:auto}
.toc .th{font:700 11px/1 var(--f-body);letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);margin:16px 0 6px}.toc .th:first-child{margin-top:0}
.toc a{display:flex;gap:8px;padding:5px 8px;border-left:2px solid var(--line);color:var(--ink);text-decoration:none}
.toc a:hover{background:var(--wash)}.toc a.on{border-left-color:var(--accent2);background:var(--wash);font-weight:600}
.toc a span{font-family:var(--f-mono);color:var(--accent);min-width:18px;font-size:12px}
.main{display:flex;flex-direction:column;gap:20px;min-width:0}
.part{display:flex;gap:18px;align-items:center;margin:26px 0 2px;padding:18px 22px;background:var(--hero-bg);color:var(--hero-ink);border-radius:var(--r);scroll-margin-top:90px}
.part:first-child{margin-top:0}
.pl{flex:none;width:52px;height:52px;border-radius:var(--r2);background:var(--accent2);color:#111;display:grid;place-items:center;font-size:24px;font-weight:600}
.pt{font:var(--dw) 25px/1.15 var(--f-display);letter-spacing:var(--dls);text-transform:var(--dt);margin:0}
.part p{margin:2px 0 0;color:var(--hero-ink2);font-size:14px}
/* cards */
.card{background:var(--paper);border:var(--bw) solid var(--line);border-radius:var(--r);padding:28px;scroll-margin-top:90px;box-shadow:var(--sh)}
.qhead{display:flex;gap:16px;margin-bottom:20px}
.num{flex:none;width:40px;height:40px;border-radius:var(--r2);border:var(--bw) solid var(--rule);color:var(--ink);display:grid;place-items:center;font-weight:600;font-size:15px}
.qtxt{min-width:0}.qline{min-height:22px;margin-bottom:6px}
.tag::before{content:"";display:inline-block;font:700 10.5px/1 var(--f-body);letter-spacing:.09em;text-transform:uppercase;padding:4px 9px;border-radius:999px}
.fig.t{font:600 19px/1.25 var(--f-body)}
h3{font:var(--dw) 22px/1.25 var(--f-display);letter-spacing:var(--dls);margin:0;text-wrap:balance;text-transform:none}
.card h4{font:700 12px/1.3 var(--f-body);letter-spacing:.09em;text-transform:uppercase;color:var(--accent);margin:26px 0 10px;padding-bottom:6px;border-bottom:var(--bw) solid var(--line)}
.answer{margin:8px 0 0;font-size:16.5px;line-height:1.5;max-width:70ch}
.sure,.means{margin-top:18px;padding:12px 16px;border-radius:var(--r2);font-size:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
.sure{background:var(--paper2);border:var(--bw) solid var(--line)}.means{background:var(--wash);border-left:4px solid var(--accent2)}.means b{white-space:nowrap}
.foot{margin-top:18px;padding-top:12px;border-top:var(--bw) solid var(--line);font-size:12px;color:var(--ink2);line-height:1.5}.foot b{text-transform:uppercase;letter-spacing:.08em;font-size:10.5px;margin-right:6px;color:var(--ink)}
.chip{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:1px 9px;font:600 12px/1.6 var(--f-body);white-space:nowrap}
.chip i{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.chip.observed{background:var(--obs-w);color:var(--obs)}.chip.estimated{background:var(--est-w);color:var(--est)}.chip.unknown{background:var(--unk-w);color:var(--unk)}.chip.conflict{background:var(--con-w);color:var(--con)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile{background:var(--paper2);border:var(--bw) solid var(--line);border-radius:var(--r2);padding:16px;min-width:0}
.cap{font:600 11px/1.3 var(--f-body);letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
.fig{font:600 23px/1.15 var(--f-mono);font-variant-numeric:tabular-nums;margin:6px 0;overflow-wrap:anywhere}
.tile .sub{font-size:13px;color:var(--ink2);margin-bottom:8px}.tile .row{margin:6px 0 4px}.src{font-size:11.5px;color:var(--ink2)}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:14px}
.tw{overflow-x:auto}
caption{text-align:left;font-size:13px;color:var(--ink2);padding-bottom:8px}
th{text-align:left;font:700 11px/1.3 var(--f-body);letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);border-bottom:var(--bw) solid var(--rule);padding:8px;vertical-align:bottom}
td{padding:9px 8px;border-bottom:1px solid var(--line)}td.n,th.n{text-align:right}
tr.like td:first-child{border-left:3px solid var(--obs)}tr.weak{color:var(--ink2)}tr.weak td:first-child{border-left:3px solid transparent}
tr.self{background:var(--wash)}tr.self td:first-child{border-left:3px solid var(--accent2)}
.why,.mut{color:var(--ink2);font-size:13px}
.gap{background:repeating-linear-gradient(135deg,var(--unk-w),var(--unk-w) 8px,transparent 8px,transparent 16px);border:1px dashed var(--unk);border-radius:var(--r2);padding:14px 16px;display:flex;flex-direction:column;gap:3px}
.gap b{color:var(--unk)}.gap span{font-size:14px}.gap em{font-size:13px;color:var(--ink2);font-style:normal}
.grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}@media(max-width:820px){.grid2{grid-template-columns:1fr}}
.key{display:flex;gap:6px 18px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin-top:8px}.key svg{vertical-align:middle}
.note{font-size:13px;color:var(--ink2);margin-top:10px;display:flex;gap:8px;align-items:baseline}
.stack{display:flex;height:22px;border-radius:var(--r2);overflow:hidden;margin:6px 0}.stack i{display:block;height:100%}
.share{display:flex;gap:3px;margin:8px 0}.share i{flex:1;height:22px;background:var(--line);border-radius:2px}.share i.me{background:var(--accent2)}.share i.same{background:var(--accent)}
.btns{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border-radius:var(--r2);padding:10px 16px;font:600 14px/1 var(--f-body)}.btn.o{background:transparent;color:var(--accent);border:var(--bw) solid var(--accent)}
.qs{display:none;margin:0;padding-left:22px}.qs li{margin:10px 0}
:root[data-view="investor"] .qs-i,:root[data-view="renter"] .qs-r,:root[data-view="buyer"] .qs-b{display:block}
/* calculator */
.calc{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:24px;align-items:start}@media(max-width:900px){.calc{grid-template-columns:1fr}}
.ctl{display:grid;gap:12px;background:var(--paper2);border:var(--bw) solid var(--line);border-radius:var(--r2);padding:16px}
.ctl label{display:grid;gap:4px;font:600 12px/1.3 var(--f-body);color:var(--ink2);letter-spacing:.03em}
.ctl .v{display:flex;justify-content:space-between;gap:8px}.ctl .v output{font:600 13px var(--f-mono);color:var(--ink)}
.ctl input[type=number]{font:500 14px var(--f-mono);padding:8px 10px;border:var(--bw) solid var(--line);border-radius:var(--r2);background:var(--paper);color:var(--ink);width:100%}
.ctl input[type=range]{width:100%;accent-color:var(--accent)}
.ctl input:focus-visible{outline:2px solid var(--accent2);outline-offset:1px}
.pillrow{display:flex;gap:8px;flex-wrap:wrap}.pill{all:unset;cursor:pointer;border:var(--bw) solid var(--accent);color:var(--accent);border-radius:999px;padding:5px 11px;font:600 12px/1 var(--f-body)}.pill:hover{background:var(--wash)}
.outs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
.out{border:var(--bw) solid var(--line);border-radius:var(--r2);padding:12px 14px;background:var(--paper)}.out .o{font:600 20px/1.2 var(--f-mono);margin-top:4px;overflow-wrap:anywhere}.out.main{background:var(--hero-bg);color:var(--hero-ink);border-color:var(--hero-bg)}.out.main .cap{color:var(--hero-ink2)}
.ph{font-size:12px;color:var(--ink2)}
.assump{display:none;margin-bottom:12px}
.illu{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:start}@media(max-width:860px){.illu{grid-template-columns:1fr}}
.site{display:flex;justify-content:center}
footer.end{background:var(--hero-bg);color:var(--hero-ink2);margin-top:20px}
footer.end .in{padding-block:34px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:24px;font-size:12.5px;line-height:1.6}
@media(max-width:820px){footer.end .in{grid-template-columns:1fr}}
footer.end .brand{color:var(--hero-ink)}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
${relCss}
`;

const toc = `<nav class="toc" aria-label="Report sections"><div class="th">Summary</div><a href="#top"><span>★</span>At a glance</a>
<div class="th">A · The property</div><a href="#s1"><span>1</span>What it is</a><a href="#s2"><span>2</span>Rent</a><a href="#s3"><span>3</span>Value</a>
<div class="th">B · Investment case</div><a href="#s4"><span>4</span>What moves the price</a><a href="#s5"><span>5</span>Return and what-ifs</a><a href="#s6"><span>6</span>Airbnb</a>
<div class="th">C · The market</div><a href="#s7"><span>7</span>Price history</a><a href="#s8"><span>8</span>New supply</a><a href="#s9"><span>9</span>Nearby suburbs</a><a href="#s10"><span>10</span>Where else</a>
<div class="th">D · Building and rules</div><a href="#s11"><span>11</span>The building</a><a href="#s12"><span>12</span>Planning</a>
<div class="th">E · Decide</div><a href="#s13"><span>13</span>Questions to ask</a><a href="#s14"><span>14</span>Sources</a></nav>`;

const kf = (cap, big, s, c) => `<div class="kf"><div class="cap">${cap}</div><div class="big">${big}</div><div class="s">${s}</div>${c}</div>`;

const topChrome = `<div class="mock">DESIGN MOCK-UP · real records for one property · ${BRAND} is a working name · not financial advice</div>
<div class="bar wrapx"><div class="in">
  <div class="brand">${logo(30)}<div>${BRAND}<small>Property Insight Report</small></div></div>
  <div class="sp"></div>
  <div class="seg" role="group" aria-label="Who is reading"><button type="button" data-view-btn="investor" aria-pressed="true">Investor</button><button type="button" data-view-btn="renter" aria-pressed="false">Renter</button><button type="button" data-view-btn="buyer" aria-pressed="false">Buyer to live</button></div>
  <div class="skins" role="group" aria-label="Report style"><span class="lab">Style</span>${Object.entries(SKINS).map(([id, s]) => `<button type="button" class="sk" data-skin-btn="${id}" aria-pressed="false" aria-label="${s.name} style" title="${s.name}: ${esc(s.note)}" style="background:${s.sw}"></button>`).join("")}<span id="skin-name">Ledger</span></div>
</div></div>`;

const body = `
${PDF ? "" : topChrome}
<header class="cover wrapx" id="top"><div class="in">
  <div>
    <div class="kick"><b>Property Insight Report</b><span>Prepared ${TODAY.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span><span>Sample VP-0310</span></div>
    <h1>${esc(p.address.replace(", Docklands", ""))}</h1>
    <p class="sub1">Docklands VIC 3008 · City of Melbourne. Rent, value, growth, supply and short-stay income for one apartment, with the source and certainty of every figure.</p>
    <div class="facts"><span class="fact">Apartment</span><span class="fact">${p.bedrooms} bed</span><span class="fact">${p.bathrooms} bath</span><span class="fact">${p.parking} car</span><span class="fact">Asking ${$(ask)} a week</span><span class="fact">Advertised ${daysListed} days</span></div>
  </div>
  <div class="cover-art">${skyline()}<div class="cap-art">Illustration. Listing photos are not shown until image rights are cleared.</div></div>
</div></header>

<section class="keys wrapx" aria-label="Key figures"><div class="in"><div class="grid">
${kf("Asking rent", `${$(ask)}<span style="font-size:14px;font-weight:500">/wk</span>`, `${rentRank === 2 ? "Second-lowest" : "Rank " + rentRank} of ${likeRents.length + 1} similar units here`, OBS())}
${kf("Middle sale price", k(saleMed), `Five like-for-like sales, ${k(saleLo)} to ${k(saleHi)}. Latest Domain sale ${k(DOM.lastSale)}.`, OBS())}
${kf("Gross yield", yMid.toFixed(1) + "%", `At the asking rent and middle price. ${gy(ask, DOM.lastSale).toFixed(1)}% at ${k(DOM.lastSale)}.`, EST("Derived"))}
${kf("Docklands growth", sgn(DKG.cagr5), `A year, median unit price over 5 years. 10 years: ${sgn(DKG.cagr10)}.`, OBS())}
${kf("Airbnb estimate", k(ownMed), `A year. About ${k(spread)} over the lease before costs.`, EST())}
${kf("Same layout for sale", `${DOM.same} of ${DOM.forSale}`, "Homes listed in this building right now", OBS())}
</div></div></section>

<div class="wrapx"><div class="in">
<div class="sum">
  <div class="panel"><div class="vp vp-i">${v_inv}</div><div class="vp vp-r">${v_ren}</div><div class="vp vp-b">${v_buy}</div></div>
  <div class="panel legend"><h3>How to read this report</h3><div class="it"><div>${OBS()}<span>A recorded fact with a source and date, like a settled sale.</span></div><div>${EST()}<span>A model's best guess, like Airbnb income. Treat it as a range.</span></div><div>${UNK()}<span>We do not have it. Shown as a hatched box, never as a zero.</span></div><div>${CON()}<span>Two of our sources disagree. We show both.</span></div></div>
  ${PDF ? `<div class="skinbox"><b>About this report.</b> Every figure carries its source and a certainty label. Figures marked Estimated are model output. Nothing here is a forecast or advice.</div>` : `<div class="skinbox"><b>Style options.</b> The dots in the top bar restyle the whole report: Ledger, Atlas, Midnight, Eucalypt and Monolith. The switch above it changes the summary and flags which sections matter most to you.</div>`}</div>
</div>
</div></div>

<div class="page wrapx"><div class="in pg">
${PDF ? "" : toc}
<main class="main">

${part("A", "The property", "What it is, what it rents for, what it is worth.")}

${sec("s1", 1, "What is this property?", `A ${p.bedrooms}-bed, ${p.bathrooms}-bath apartment, matched to the official address record, available now.`, ["ctx", "core", "ctx"], `
<div class="tiles">
${tile("Address", "Exact unit match", OBS(), esc(vm.ezi_address), "Vicmap Address, 11 Nov 2026")}
${tile("Official property ID", esc(vm.property_pfi), OBS(), `Council: City of Melbourne · Mesh block ${esc(vm.mesh_block)}`, "Vicmap Address")}
${tile("Advertised by", esc(detail.agent_name), OBS(), esc(detail.agency_name) + " · listed since 7 Sep 2026", "realestate.com.au and Domain")}
${tile("Tower", "628 Flinders St", OBS(), "About 733 homes in the building", "Domain building page, 11 Nov 2026")}
</div>
<div class="note">${CON()}<span>Furnished: our CRM says furnished, the listing says "Furnished: no". Both are shown. Confirm with the agent.</span></div>
${sure("high", "The address matches an official record down to the unit number.")}
${foot("Vicmap Address (state open data), realestate.com.au via RapidAPI, Domain building page capture.")}`)}

${sec("s2", 2, "What does it rent for, compared with the market?", `Asking ${$(ask)} a week is the second-lowest of ${likeRents.length + 1} similar units in this building, and well under suburb medians.`, ["core", "core", "ctx"], `
${rentRuler()}
<div class="grid2" style="margin-top:16px">
<div class="tw"><table><caption>Similar units asking for rent now (2 bed, 1 bath, no car)</caption><thead><tr><th>Unit</th><th class="n">Asking rent</th><th>Available</th></tr></thead><tbody>${rentRows}</tbody></table></div>
<div>${tile("Bond", esc(self.bond), OBS(), "About 4.3 weeks of rent", "realestate.com.au, 11 Nov 2026")}<div style="height:12px"></div>${tile("Advertised for", daysListed + " days", OBS(), "Since 7 Sep 2026. Worth asking whether the landlord will negotiate.", "Domain and realestate.com.au listing dates")}</div>
</div>
${sure("med", "These are asking rents, not signed leases. The official figure is real leases but covers all 2-bed flats in Docklands, including newer and larger towers.")}
${means(`Compared with the market, this unit is cheap to lease. That is good for a tenant or an operator. It may also mean the unit has something that makes it worth less, such as no car space or an older fit-out.`)}
${foot("realestate.com.au rentals via RapidAPI (11 Nov 2026). Homes Victoria Rental Report, moving annual median rent by suburb, June quarter 2026.")}`)}

${sec("s3", 3, "What is it worth?", `Similar apartments here sold for ${k(DOM.lastSale)} to ${k(saleHi)} in the past six months. The middle of the five we hold is ${$(saleMed)}.`, ["core", "ctx", "core"], `
${saleStrip()}
<div class="tw"><table style="margin-top:12px"><caption>Every sale found at 628 Flinders Street, May to Sep 2026 (realestate.com.au). The green-bar rows have the same layout as this unit.</caption><thead><tr><th>Unit</th><th class="n">Sold for</th><th>Date</th><th>Layout</th><th>Used in the middle price?</th></tr></thead><tbody>${salesRows}</tbody></table></div>
<div class="note">${CON()}<span>Domain's building page shows a newer sale of the same layout, unit ${DOM.lastSaleUnit} at ${$(DOM.lastSale)} on ${DOM.lastSaleDate}, which is not in our realestate.com.au set and is lower than all five. Our middle price may be too high.</span></div>
<div class="grid2" style="margin-top:16px">
${gap("Has unit 310 itself sold recently?", "No sale of this unit appears in the data window.", "Check the title history at the land titles office if the last sale price matters.")}
${gap("What would a valuation model say?", "No automated valuation is connected yet.", "Connect a valuation source; it would sit beside these sales, never replace them.")}
</div>
${sure("med", `Five settled sales plus one newer Domain sale, same building and layout. The small number of sales and the newer, lower sale keep this at medium.`)}
${means(`Treat ${k(DOM.lastSale)} to ${k(saleHi)} as the realistic range, and expect to pay toward the lower end. This building sells below the Docklands 2-bed median of ${k(dr.sold2_median)} (${dr.sold2_n} recent sales).`)}
${foot("realestate.com.au sold listings via RapidAPI, 11 Nov 2026 (newest 150 Docklands sales only). Domain building page capture supplied by the report author, 11 Nov 2026.")}`)}

${part("B", "The investment case", "What moves the price, what you would earn, and what the alternative use is.")}

${sec("s4", 4, "What makes this apartment worth more or less?", `A second bedroom, a second bathroom and a car space each add roughly a quarter to a third. The floor level barely matters. One in three homes for sale here has the same layout.`, ["core", "off", "core"], `
<h4>What the price depends on</h4>
${driverBars()}
<div class="note">${EST()}<span>Estimated from ${PD.n} apartment sales in six inner suburbs (R-squared ${PD.r2.toFixed(2)}). Bars show the effect with everything else equal; the line is the likely error. Grey means the effect is not clear. A typical gap of about 19% between predicted and actual price remains, so view, age and condition still matter.</span></div>
<div class="grid2" style="margin-top:16px">
<div class="tw"><table><caption>Typical sale price by layout (six suburbs pooled)</caption><thead><tr><th>Layout</th><th class="n">Median</th><th class="n">Sales</th></tr></thead><tbody>${layoutRows}</tbody></table></div>
<div class="tile"><div class="cap">Competing homes for sale in this tower</div><div class="fig">${DOM.same} of ${DOM.forSale}</div><div class="share" role="img" aria-label="${DOM.same} of ${DOM.forSale} listings are the same layout">${Array.from({ length: DOM.forSale }, (_, i) => `<i class="${i < DOM.same ? "same" : ""}"></i>`).join("")}</div><div class="sub">Same layout (2 bed, 1 bath, no car) as unit 310, ${Math.round((DOM.same / DOM.forSale) * 100)}% of current listings.</div>${OBS()}<div class="src">Domain building page capture, 11 Nov 2026</div></div>
</div>
<h4>What the sellers of the same layout are asking</h4>
<div class="tw"><table><thead><tr><th>Unit</th><th>Asking range</th><th>Note</th></tr></thead><tbody>${DOM.asks.map(([u, r, n]) => `<tr><td>${u}</td><td>${r}</td><td class="why">${n}</td></tr>`).join("")}<tr class="weak"><td>3 more</td><td>No range captured</td><td class="why">One is marked "Repriced to sell"</td></tr></tbody></table></div>
${sure("med", `The price effects are an estimate from a regression, not a valuation. Competing listings are asking prices, not sales.`)}
${means(`A seller of this layout has ${DOM.same - 1} direct rivals, several asking well below the last sale. For a buyer that is negotiating room. For an owner it is a reason to price sharply or add something the others lack.`)}
${foot("Project model on realestate.com.au sold listings via RapidAPI (newest 150 sales per suburb). Domain building page capture, 11 Nov 2026.")}`)}

${sec("s5", 5, "What would the return be, and what if prices move?", PDF ? `About ${yMid.toFixed(1)}% a year gross at today's asking rent. Below, what you would own after ten years at different growth rates.` : `About ${yMid.toFixed(1)}% a year gross at today's asking rent. Set your own growth rate below to see what you would own in ten years.`, ["core", "off", "ctx"], `
<div class="tw"><table><caption>Gross yield = a year of rent divided by the price. These rows are what-if scenarios, not evidence.</caption><thead><tr><th>If the rent is</th>${yieldCols.map(([, l]) => `<th class="n">${l}</th>`).join("")}</tr></thead><tbody>${yieldRows}</tbody></table></div>
<div class="note"><span>Prices at the head of each column: ${yieldCols.map(([pr]) => k(pr)).join(", ")}.</span></div>
<h4>${PDF ? "What would you own after ten years?" : "What would you own in the future? Set the growth rate"}</h4>
<div class="assump"><table><caption>Assumptions behind the figures below (example inputs, not data)</caption><tbody>
<tr><td>Purchase price</td><td class="n">${$(mid)}</td><td>Deposit</td><td class="n">${CALC.dep}% (${$(mid * CALC.dep / 100)})</td></tr>
<tr><td>Weekly rent</td><td class="n">${$(ask)}</td><td>Loan interest (interest only)</td><td class="n">${CALC.rate}% a year</td></tr>
<tr><td>Weeks empty a year</td><td class="n">${CALC.vac}</td><td>Owners corp., rates, insurance, repairs</td><td class="n">${$(CALC.costs)} a year</td></tr>
<tr><td>Holding period</td><td class="n">${CALC.years} years</td><td>Growth shown first</td><td class="n">${sgn(histG)} a year (Docklands 5-year history)</td></tr></tbody></table>
<div class="note"><span>We do not have this building's owners corporation fees. The interest rate, vacancy and costs above are examples to be replaced.</span></div></div>
<div class="calc">
<div class="ctl">
<label for="c-price"><span>Purchase price</span><input id="c-price" type="number" step="5000" min="100000" value="${mid}"></label>
<label for="c-dep"><span>Deposit, % of price</span><input id="c-dep" type="number" step="1" min="5" max="100" value="${CALC.dep}"></label>
<label for="c-rate"><span>Loan interest rate, % a year (interest only)</span><input id="c-rate" type="number" step="0.1" min="0" value="${CALC.rate}"></label>
<label for="c-rent"><span>Weekly rent</span><input id="c-rent" type="number" step="5" min="0" value="${ask}"></label>
<label for="c-vac"><span>Weeks empty each year</span><input id="c-vac" type="number" step="1" min="0" max="52" value="2"></label>
<label for="c-costs"><span>Owners corporation, rates, insurance and repairs, a year</span><input id="c-costs" type="number" step="100" min="0" value="5500"></label>
<div class="ph">Interest rate, vacancy and costs are example inputs, not data. We do not have this building's owners corporation fees yet. Replace them.</div>
<label for="c-growth"><span class="v">Price growth <output id="v-growth" for="c-growth"></output></span><input id="c-growth" type="range" min="-5" max="8" step="0.1" value="0"></label>
<label for="c-years"><span class="v">Hold for <output id="v-years" for="c-years"></output></span><input id="c-years" type="range" min="1" max="30" step="1" value="10"></label>
<div class="pillrow"><button type="button" class="pill" id="c-hist">Use Docklands 5-year history (${sgn(histG)})</button><button type="button" class="pill" id="c-flat">Use 0%</button></div>
</div>
<div>
<div class="outs"><div class="out main"><div class="cap">Value at the end</div><div class="o" id="o-end"></div></div><div class="out"><div class="cap">Equity (value less loan)</div><div class="o" id="o-equity"></div></div><div class="out"><div class="cap">Rent less loan interest and costs</div><div class="o" id="o-net"></div></div><div class="out"><div class="cap">Cash you put in</div><div class="o" id="o-cash"></div></div><div class="out"><div class="cap">Total gain on your cash</div><div class="o" id="o-gain"></div></div><div class="out"><div class="cap">As a yearly return</div><div class="o" id="o-ann" style="font-size:15px"></div></div></div>
<svg id="c-chart" viewBox="0 0 640 270" role="img" aria-label="Property value over time at several growth rates against the loan" style="width:100%;height:auto"></svg>
<div class="key"><span>${PDF ? "Gold line is the scenario at the Docklands 5-year history. Grey lines are other growth rates. Dashed red is the loan." : "Gold line is the rate you set. The accent-coloured line is the Docklands 5-year history."}</span></div>
</div></div>
<div class="tw" style="margin-top:14px"><table><caption>The same purchase at other growth rates (uses your inputs above)</caption><thead><tr><th>Growth</th><th class="n">Value at end</th><th class="n">Equity</th><th class="n">Total gain on cash</th><th class="n">Yearly return</th></tr></thead><tbody id="c-rows"></tbody></table></div>
<div style="margin-top:14px">${gap("Owners corporation fees, levies and council rates: unknown", "A net return without them would be invented, so the calculator asks you to enter them.", "Request the owners corporation certificate from the agent.")}</div>
${sure("med", `The inputs are real (price, rent, history). The results are illustrations from numbers you choose. They leave out stamp duty, selling costs, tax and changes in rent. This is not a forecast.`)}
${means(`Over the past five years Docklands unit prices drifted down about half a percent a year while rents rose. At 0% growth the return comes almost entirely from rent, so the price you pay matters more than the market.`)}
${foot("Valuer-General Victoria median unit price by suburb, 2015 to 2025 (CC BY). realestate.com.au asking rent via RapidAPI. Calculator inputs are user-set examples.")}`)}

${sec("s6", 6, "Could it work as an Airbnb?", `Estimates say about ${$(ownMed)} a year, but nothing we have shows short stays are allowed in this building.`, ["core", "ctx", "ctx"], `
<div class="tiles">
${tile("Our estimate, per year", $(ownMed), EST("Estimated, strong"), `${$(ownP25)} to ${$(ownP75)} · ${ownEst.comps_n} same-building 2-bed 1-bath listings`, "City Retreats model, 19 Oct 2026")}
${tile("AirDNA estimate, per year", $(airRev), EST("Estimated, low confidence"), `${Math.round(airOcc * 100)}% occupied · ${$(airAdr)} a night · ${airConf.score.toFixed(0)}/100 confidence`, "AirDNA via RapidAPI, 2 Nov 2026")}
${tile("Gross spread over the lease", $(spread), EST(), "Estimate minus a year of rent. Before cleaning, platform fees, utilities and furniture.", "Derived")}
</div>
<h4>What is already operating in the building</h4>
<div class="tiles">
${tile("Airbnb listings in the building", String(mb.active_listings), OBS(), `${mb.entire_homes} whole apartments · ${mb.pro_listings} run by operators with 5 or more listings`, "City Retreats building register, 2 Nov 2026")}
${tile("Typical occupancy", Number(mb.occupancy).toFixed(0) + "%", OBS(), "Median over the last 12 months", "City Retreats building register")}
${tile("City Retreats units here", String(mb.our_properties), OBS(), "Of 28 distinct units we have seen", "City Retreats CRM")}
</div>
<div class="note">${CON()}<span>This unit's own record says 0 Airbnb listings in the building; the building register says ${mb.active_listings}. We use the register.</span></div>
<div style="margin-top:12px">${gap("Are short stays allowed in this building? Unknown", "Activity is not permission. An owners corporation can ban short stays by rule, and no rule or flag is recorded for this building.", "Ask the agent and the owners corporation. Record the answer so every unit here inherits it.")}</div>
${sure("med", "Two independent estimates agree within 2%, but AirDNA rates its own estimate low. Occupancy and nightly rate are model outputs, not bookings.")}
${means(`The income looks strong and many operators are already there. That does not tell you the building allows it. This is the most important question to settle before committing.`)}
${foot("AirDNA rentalizer via RapidAPI (address match), City Retreats model and building register. Income in AUD.")}`)}

${part("C", "The market", "Where Docklands has been, what is being built, and how it compares with other places to invest.")}

${sec("s7", 7, "How have prices moved?", `Docklands unit prices have not grown in ten years: ${sgn(DKG.cagr5)} a year over five years and ${sgn(DKG.cagr10)} over ten.`, ["core", "ctx", "core"], `
${historyChart()}
<div class="tiles" style="margin-top:14px">
${tile("Docklands median unit, 2025", k(DKG.latest_2025), OBS(), `${k(DKG.y2015)} in 2015`, "Valuer-General Victoria")}
${tile("Five-year growth", sgn(DKG.cagr5) + " a yr", OBS(), "2020 to 2025, annual medians", "Valuer-General Victoria")}
${tile("Latest quarter on a year ago", sgn(DKG.yoy_pct), OBS(), `${DKG.sales_q1_26} sales in Jan to Mar 2026`, "Valuer-General Victoria")}
${tile("This building, ten years", sgn(DOM.held10, 2) + " a yr", OBS(), "Sales in the past year against the price paid in 2016", "Domain building page")}
</div>
${sure("med", "Official medians from every recorded sale, but a median mixes old and new stock. New towers pull it down without any single apartment falling in value.")}
${means(`Prices are about where they were in 2015, while rents have climbed. An investor here is paid through rent, not through price growth.`)}
${foot("Valuer-General Victoria, Victorian Property Sales Report: median unit by suburb, 2015 to 2025 and Jan to Mar 2026 (CC BY 4.0). Domain building page capture, 11 Nov 2026.")}`)}

${sec("s8", 8, "What new apartments are coming?", `${pipeSites} nearby projects, up to ${pipeTotal.toLocaleString("en-AU")} dwellings. Only ${pipe["UNDER CONSTRUCTION"].d.toLocaleString("en-AU")} are under construction.`, ["core", "core", "core"], `
<div class="illu"><div class="site">${sitePlan()}</div>
<div>
<div class="stack" role="img" aria-label="Dwellings by stage">${[["UNDER CONSTRUCTION", "var(--obs)"], ["APPROVED", "var(--est)"], ["APPLIED", "var(--unk)"]].map(([s, c]) => `<i style="width:${(pipe[s].d / pipeTotal) * 100}%;background:${c}"></i>`).join("")}</div>
<div class="key"><span><b style="color:var(--obs)">■</b> Under construction ${pipe["UNDER CONSTRUCTION"].d.toLocaleString("en-AU")}</span><span><b style="color:var(--est)">■</b> Approved ${pipe.APPROVED.d.toLocaleString("en-AU")}</span><span><b style="color:var(--unk)">■</b> Applied for ${pipe.APPLIED.d.toLocaleString("en-AU")}</span></div>
<div class="tw"><table style="margin-top:14px"><caption>Largest projects within 800 m</caption><thead><tr><th>On plan</th><th>Site</th><th>Stage</th><th class="n">Dwellings</th><th class="n">Floors</th></tr></thead><tbody>${pipeTop.map((r, i) => `<tr><td class="n" style="text-align:left"><b>${i + 1}</b></td><td>${esc(title(r.street_address.replace(/ VIC \d+/i, "")))}</td><td>${esc(title(r.status))}</td><td class="n">${r.resi_dwellings.toLocaleString("en-AU")}</td><td class="n">${r.floors_above}</td></tr>`).join("")}</tbody></table></div>
</div></div>
${sure("med", "Counts come from council records. A site is counted once at its most advanced stage, but approval does not mean it will be built.")}
${means(`A large pipeline means more competing apartments for the same renters and buyers. It is the main risk to rents continuing to rise.`)}
${foot("City of Melbourne Development Activity Monitor (sites de-duplicated, most advanced stage kept), 800 m radius.")}`)}

${sec("s9", 9, "How does Docklands compare with nearby suburbs?", `Docklands has the highest official rent of the six suburbs we track, and one of the weakest five-year price records.`, ["ctx", "core", "ctx"], `
<div class="tw"><table><caption>Two-bedroom apartments and units. Yield and Airbnb figures are indicative.</caption><thead><tr><th>Suburb</th><th class="n">Official rent</th><th class="n">Rent change on year</th><th class="n">Median unit price</th><th class="n">Price growth, 5 yr</th><th class="n">Gross yield</th><th class="n">Airbnb occupancy</th><th class="n">Airbnb nightly</th></tr></thead><tbody>${subRows}</tbody></table></div>
${sure("med", "Rents are real leases (Homes Victoria). Prices are official medians. Yield uses recent sale and asking medians and is indicative. Airbnb figures are AirDNA model output.")}
${foot("Homes Victoria Rental Report (June quarter 2026); Valuer-General Victoria; realestate.com.au via RapidAPI; AirDNA data held in the CRM.")}`)}

${sec("s10", 10, "Where else could you invest?", `Outer and middle-ring suburbs have grown faster but pay lower yields. Docklands ranks ${dkRank} of ${L26.length} on growth and yield combined.`, ["core", "ctx", "core"], `
${scatter()}
<div class="key"><span><b style="color:var(--accent2)">●</b> Docklands</span><span><b style="color:var(--accent)">●</b> Other suburbs we track</span><span><b style="color:var(--ink2)">●</b> Other suburbs with at least 60 sales in the quarter. Bigger circle, more sales.</span></div>
<div class="tw"><table style="margin-top:14px"><caption>Top ten of ${L26.length} suburbs by growth and yield combined (equal weight)</caption><thead><tr><th>Suburb</th><th class="n">Median unit</th><th class="n">Growth 5 yr</th><th class="n">Growth 10 yr</th><th class="n">Yield</th><th class="n">Rent growth 5 yr</th><th class="n">Sales in quarter</th></tr></thead><tbody>${screenRows}</tbody></table></div>
<div class="grid2" style="margin-top:16px">
${gap("Forecasts: not included", "We show history only. A forecast needs a licensed source and we have not chosen one.", "Test a paid suburb forecast and compare it with these history figures.")}
${gap("Bedroom-matched yields: not available", "Official prices are for all units together, while rents are for 1 and 2 bed flats.", "Add a bedroom-level price source so yields compare like with like.")}
</div>
${sure("med", `History is official. The ranking is a simple combination of two measures, not a recommendation. Yield mixes 1 and 2 bed rents with all-unit prices. Rent growth from 2021 starts at a COVID low.`)}
${means(`${dkScreen ? `Docklands pays ${dkScreen.yield.toFixed(1)}% but has not grown. Suburbs such as Frankston and Dandenong have grown ${sgn(L26.find((o) => o.sub === "FRANKSTON").cagr5, 0)} and ${sgn(L26.find((o) => o.sub === "DANDENONG").cagr5, 0)} a year at lower yields. Which is better depends on whether you need income now or growth later.` : ""}`)}
${foot("Valuer-General Victoria median unit prices (CC BY 4.0); Homes Victoria moving annual median rents, June quarter 2026. Suburbs with at least 60 sales in Jan to Mar 2026 and a matching rent record.")}`)}

${part("D", "The building and the rules", "What lives behind the front door, and what the planning scheme says.")}

${sec("s11", 11, "What do we know about the building?", `Good facilities and a high share of renters, but no financial, rules or condition records.`, ["core", "core", "core"], `
<div class="tiles">
${tile("Facilities advertised", "Pool · Gym · Spa · Sauna", OBS("Advertised"), "City views, storage", "Listing, Sep 2026")}
${tile("Homes rented", DOM.rentedPct + "%", EST("Domain estimate"), "Owner-occupied 45%", "Domain building page, 11 Nov 2026")}
${tile("Average owner stay", "6 yrs 5 mo", OBS(), "30% have owned for 10 years or more", "Domain building page")}
${tile("Address records", "721", OBS(), "Units, car spaces and storage", "Vicmap Address")}
</div>
<div class="grid2" style="margin-top:14px">
${gap("Owners corporation fees, special levies and planned major works: unknown", "These drive holding costs and surprise bills.", "Request the owners corporation certificate and records.")}
${gap("Defects, cladding and insurance claims: unknown", "No document about this building's condition is in our data.", "Ask for the building and pest report and the last two years of owners corporation minutes.")}
</div>
${sure("low", "We have facilities, tenure and counts only. Everything that affects ongoing cost and risk is missing.")}
${means(`In an apartment the building matters as much as the unit. This is the biggest gap in the report.`)}
${foot("Listing, Vicmap Address, Domain building page capture. No owners corporation data source is connected.")}`)}

${sec("s12", 12, "What does the planning say?", `${esc(title(zone?.zone_description))}, with ${(plan.overlays ?? []).length} overlays. This is a map screen, not a planning certificate.`, ["ctx", "off", "core"], `
<div class="tiles">${tile("Planning zone", esc(zone?.zone_code ?? ""), OBS(), esc(title(zone?.zone_description)), "Vicmap Planning, 11 Nov 2026")}${tile("Flood overlay", "None returned", OBS(), "No flood or inundation overlay was returned at this point", "Vicmap Planning")}</div>
<div class="tw"><table style="margin-top:12px"><caption>Overlays at this location</caption><thead><tr><th>Code</th><th>Name</th><th>In plain English</th></tr></thead><tbody>${overlays}</tbody></table></div>
${sure("med", "The location is exact, but overlay text is general. Read the schedule before relying on it.")}
${foot("Vicmap Planning, point-in-polygon at the building location.")}`)}

${part("E", "Decide", "The questions that close the gaps, and where every figure came from.")}

${sec("s13", 13, "What should you ask next?", `A short list for the agent, written for your situation.`, ["core", "core", "core"], `
<ol class="qs qs-i">
<li><b>Short stays:</b> Does the owners corporation restrict short-term stays? Please send the current rules.</li>
<li><b>Costs:</b> What are the annual owners corporation fees, and are any special levies or major works planned?</li>
<li><b>Price:</b> A unit of this layout sold for ${k(DOM.lastSale)} on ${DOM.lastSaleDate}. What has the owner of unit 310 been offered?</li>
<li><b>Tenancy:</b> If rented, what is the lease end date and the current rent?</li>
<li><b>Documents:</b> Can you share the owners corporation certificate and the last two years of meeting minutes?</li></ol>
<ol class="qs qs-r">
<li><b>Rent:</b> It has been advertised ${daysListed} days at ${$(ask)} a week. Will the landlord consider a longer lease, or a lower rent?</li>
<li><b>Furnishing:</b> Is the unit furnished? The listing and our records disagree.</li>
<li><b>Neighbours:</b> How many apartments here are used as short stays, and how is noise handled?</li>
<li><b>Costs:</b> Which utilities and building services are included in the rent?</li>
<li><b>Condition:</b> Can I see the last condition report and any maintenance requests?</li></ol>
<ol class="qs qs-b">
<li><b>Price:</b> A unit of this layout sold for ${k(DOM.lastSale)} on ${DOM.lastSaleDate}. What price range is the owner open to?</li>
<li><b>Costs:</b> What are the annual owners corporation fees and any special levies?</li>
<li><b>Rules:</b> Are there limits on pets, renovations or short stays?</li>
<li><b>Condition:</b> Are there defects, cladding or insurance claims on the building?</li>
<li><b>Competition:</b> ${DOM.same - 1} similar units are for sale. Why is this one different?</li></ol>
${PDF ? "" : `<div class="btns"><span class="btn">Call agent</span><span class="btn o">Add to call script</span><span class="btn o">Save this report</span></div>`}
${foot("Generated from the gaps above. Answers are saved with a date and source, and the next unit in this building inherits them.")}`)}

${sec("s14", 14, "Where did all this come from?", `Eleven sources: six give recorded facts, three give estimates, and two we still need.`, ["ctx", "ctx", "ctx"], `
<div class="tw"><table><thead><tr><th>Source</th><th>Retrieved</th><th>Match</th><th>Used in</th></tr></thead><tbody>
<tr><td>Vicmap Address (Victorian open data)</td><td>11 Nov 2026</td><td>${OBS("Exact unit")}</td><td>1, 11</td></tr>
<tr><td>Vicmap Planning</td><td>11 Nov 2026</td><td>${OBS("Exact location")}</td><td>12</td></tr>
<tr><td>Valuer-General Victoria, median unit by suburb (CC BY 4.0)</td><td>Mar 2026 quarter</td><td>${OBS("Suburb")}</td><td>7, 9, 10</td></tr>
<tr><td>Homes Victoria Rental Report (CC BY 4.0)</td><td>Jun quarter 2026</td><td>${OBS("Suburb")}</td><td>2, 9, 10</td></tr>
<tr><td>City of Melbourne Development Activity Monitor</td><td>11 Nov 2026</td><td>${OBS("800 m radius")}</td><td>8</td></tr>
<tr><td>realestate.com.au via RapidAPI (unofficial wrapper)</td><td>11 Nov 2026</td><td>${OBS("Exact unit")}</td><td>1, 2, 3, 4</td></tr>
<tr><td>Domain building page (page text supplied by the report author)</td><td>11 Nov 2026</td><td>${OBS("Building")}</td><td>3, 4, 7, 11</td></tr>
<tr><td>AirDNA via RapidAPI, and the CRM's AirDNA data</td><td>2 Nov 2026</td><td>${EST("Address, low conf.")}</td><td>6, 9</td></tr>
<tr><td>City Retreats model and building register</td><td>19 Oct, 2 Nov 2026</td><td>${EST("Building tier")}</td><td>6</td></tr>
<tr><td>Price model (regression on 599 sales)</td><td>11 Nov 2026</td><td>${EST("Six suburbs")}</td><td>4</td></tr>
<tr><td>Owners corporation records and valuation model</td><td>n/a</td><td>${UNK()}</td><td>3, 5, 11</td></tr>
</tbody></table></div>
${foot("realestate.com.au data comes through an unofficial third-party service, and the Domain page was copied by hand. Check both sets of terms before using either in a paid product.")}`)}

</main></div></div>

<footer class="end wrapx"><div class="in">
<div><div class="brand">${logo(26)}<div>${BRAND}</div></div><p style="margin:10px 0 0">Property Insight Report · Sample VP-0310 · Prepared ${TODAY.toLocaleDateString("en-AU")}</p></div>
<div><p style="margin:0 0 8px"><b style="color:var(--hero-ink)">General information only.</b> This report is not financial, legal, tax or valuation advice and does not predict future prices. Figures marked Estimated come from models and should be treated as ranges. Scenario results use inputs chosen by the reader. Check the owners corporation certificate, the contract and local planning controls before you commit money.</p><p style="margin:0">Includes data from Valuer-General Victoria and Homes Victoria (Creative Commons Attribution 4.0), Vicmap (State of Victoria), the City of Melbourne, realestate.com.au, Domain and AirDNA.</p></div>
</div></footer>
`;

const dataObj = { histG, pdf: PDF, skin: SKIN, view: VIEW, skinNames: Object.fromEntries(Object.entries(SKINS).map(([id, s]) => [id, s.name])) };
const ink2 = (SKINS[SKIN].css.match(/--ink2:(#[0-9A-Fa-f]{6})/) || [])[1] ?? "#666666";
const pdfCss = `
/* PDF: A4 pages, single column, no navigation, static calculator */
@page{size:A4;margin:11mm 10mm 14mm 10mm;@bottom-left{content:"${BRAND} · Property Insight Report · Sample VP-0310";font:500 8px 'Inter',sans-serif;color:${ink2}}@bottom-right{content:"Page " counter(page) " of " counter(pages);font:500 8px 'Inter',sans-serif;color:${ink2}}}
@page :first{@bottom-left{content:none}@bottom-right{content:none}}
html.pdf{background:var(--bg)}
html.pdf,html.pdf *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
html.pdf body{font-size:13.5px;line-height:1.5}
html.pdf .wrapx{padding-left:0;padding-right:0}
html.pdf .tag,html.pdf .toc,html.pdf .bar,html.pdf .mock,html.pdf .ctl,html.pdf .pillrow{display:none!important}
html.pdf .assump{display:block}
html.pdf .cover .in{grid-template-columns:minmax(0,1.12fr) minmax(0,1fr)!important;padding-block:26px 70px;gap:18px;padding-left:22px;padding-right:22px}
html.pdf h1{font-size:33px;margin:10px 0 6px}
html.pdf .sub1{font-size:14px;margin-bottom:14px}
html.pdf .kick{font-size:10px}
html.pdf .fact{font-size:11.5px;padding:2px 10px}
html.pdf .cap-art{font-size:9px}
html.pdf .keys .in{padding:0}
html.pdf .keys .grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
html.pdf .kf{padding:12px 13px 10px}
html.pdf .kf .big{font-size:23px}
html.pdf .kf .s{font-size:11.5px;margin-bottom:6px}
html.pdf .kf .cap{font-size:9.5px}
html.pdf .in{max-width:none}
html.pdf .sum{grid-template-columns:1fr!important;margin-top:18px;gap:14px}
html.pdf .panel{padding:18px}
html.pdf .lead{font-size:18px}
html.pdf .pg{grid-template-columns:1fr!important}
html.pdf .page{padding-block:18px 0}
html.pdf .main{gap:14px}
html.pdf .part{margin:16px 0 0;padding:14px 18px}
html.pdf .pl{width:42px;height:42px;font-size:20px}
html.pdf .pt{font-size:21px}
html.pdf .card{padding:20px;box-shadow:none}
html.pdf .qhead{margin-bottom:14px}
html.pdf h3{font-size:19px}
html.pdf .answer{font-size:14.5px}
html.pdf .tiles{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
html.pdf .tile{padding:12px}
html.pdf .fig{font-size:19px}
html.pdf .fig.t{font-size:16px}
html.pdf table{font-size:11.5px}
html.pdf th{font-size:9px;padding:6px}
html.pdf td{padding:6px}
html.pdf .grid2,html.pdf .calc{grid-template-columns:minmax(0,1fr)!important}
html.pdf .illu{grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)!important;gap:14px}
html.pdf .illu .site{display:block}
html.pdf .illu .site svg{max-width:100%;width:100%}
html.pdf .qhead{break-inside:avoid}
html.pdf .grid2{gap:10px}
html.pdf .tw{overflow:visible}
html.pdf .sure,html.pdf .means{font-size:12.5px;padding:9px 13px;margin-top:12px}
html.pdf .foot{font-size:10px}
html.pdf .outs{grid-template-columns:repeat(3,minmax(0,1fr))}
html.pdf .out .o{font-size:16px}
html.pdf .out.main .o{font-size:18px}
html.pdf .assump table{margin-bottom:6px}
html.pdf footer.end .in{grid-template-columns:1fr;padding-block:22px;font-size:10.5px}
html.pdf footer.end{margin-top:12px}
html.pdf .cover,html.pdf .keys .grid,html.pdf .panel,html.pdf .tile,html.pdf .gap,html.pdf .sure,html.pdf .means,html.pdf .foot,html.pdf .out,html.pdf tr,html.pdf svg,html.pdf .note,html.pdf .stack,html.pdf .share,html.pdf .part,html.pdf footer.end,html.pdf .assump,html.pdf .calc,html.pdf .outs{break-inside:avoid}
html.pdf .part,html.pdf .qhead,html.pdf .card h4,html.pdf caption,html.pdf thead{break-after:avoid}
`;
const rootAttrs = PDF ? `class="pdf" data-skin="${SKIN}" data-view="${VIEW}"` : "";
const client = readFileSync("scripts/27-report-client.js", "utf8").replace("__DATA__", JSON.stringify(dataObj));
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500..700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Manrope:wght@500..800&family=Newsreader:opsz,wght@6..72,500..700&family=Space+Grotesk:wght@500..700&display=swap">`;
const headTop = `<title>${BRAND} Insight Report</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>${css}${PDF ? pdfCss : ""}</style>`;
const fragment = `${headTop}\n${body}\n<script>${client}</script>`;
const full = `<!doctype html><html lang="en" ${rootAttrs}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${headTop}</head><body>\n${body}\n<script>${client}</script></body></html>`;
if (PDF) {
  writeFileSync(OUTDIR + `property-report-${SKIN}-${VIEW}.print.html`, full);
  console.log("wrote print html", SKIN, VIEW);
} else {
  writeFileSync(OUTDIR + "property-report.artifact.html", fragment);
  writeFileSync(OUTDIR + "property-report.html", full);
  console.log("wrote property-report.html", (full.length / 1024).toFixed(0) + " KB", { histG, rentRank, yMid: yMid.toFixed(2), dkRank, of: L26.length, pipeSites, pipeTotal });
}
