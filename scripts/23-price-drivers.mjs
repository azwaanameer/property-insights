// What moves apartment sale prices? OLS on log(price) over the REA sold harvest (900 sales, 6 suburbs).
import { readFileSync, writeFileSync } from "node:fs";
const H = JSON.parse(readFileSync("data/rp_harvest.json", "utf8"));
const num = (s) => { const m = String(s ?? "").replace(/,/g, "").match(/\$?\s*([\d.]+)/); return m ? +m[1] : null; };
const floorOf = (addr) => { const m = String(addr ?? "").match(/^\s*(?:level\s*\d+,\s*)?([0-9]+)[A-Za-z]?\s*\//i); if (!m) return null; const d = m[1]; if (d.length < 3) return null; return Math.floor(+d / 100); };
const subs = ["Melbourne CBD", "Southbank", "Docklands", "St Kilda", "South Yarra", "Port Melbourne"];
const rows = H.sold.map((r) => ({ p: num(r.price), bed: r.bed, bath: r.bath, park: r.park ?? 0, sub: r.crm_suburb, floor: floorOf(r.address), type: r.type, addr: r.address }))
  .filter((r) => r.p && r.p > 150000 && r.p < 2500000 && r.bed >= 1 && r.bed <= 3 && r.bath >= 1 && r.floor != null && /apartment|unit|flat/i.test(r.type ?? "") && subs.includes(r.sub));
console.log("sales used:", rows.length, "of", H.sold.length);

const names = ["intercept", ...subs.slice(1).map((s) => "suburb:" + s), "2 bed (vs 1)", "3 bed (vs 1)", "2+ baths (vs 1)", "has car space", "floor 10-19 (vs 1-9)", "floor 20-29", "floor 30+"];
const X = rows.map((r) => [1, ...subs.slice(1).map((s) => +(r.sub === s)), +(r.bed === 2), +(r.bed === 3), +(r.bath >= 2), +(r.park >= 1), +(r.floor >= 10 && r.floor < 20), +(r.floor >= 20 && r.floor < 30), +(r.floor >= 30)]);
const y = rows.map((r) => Math.log(r.p));
const k = names.length, n = X.length;
const XtX = Array.from({ length: k }, () => Array(k).fill(0)), Xty = Array(k).fill(0);
for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) { Xty[a] += X[i][a] * y[i]; for (let b = 0; b < k; b++) XtX[a][b] += X[i][a] * X[i][b]; }
const inv = (M) => { const m = M.map((r, i) => [...r, ...M.map((_, j) => +(i === j))]); for (let c = 0; c < k; c++) { let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; [m[c], m[p]] = [m[p], m[c]]; const d = m[c][c]; for (let j = 0; j < 2 * k; j++) m[c][j] /= d; for (let r = 0; r < k; r++) if (r !== c) { const f = m[r][c]; for (let j = 0; j < 2 * k; j++) m[r][j] -= f * m[c][j]; } } return m.map((r) => r.slice(k)); };
const Inv = inv(XtX);
const beta = Inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
const resid = y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * beta[j], 0));
const sse = resid.reduce((s, e) => s + e * e, 0), sst = y.reduce((s, v) => s + (v - y.reduce((a, b) => a + b, 0) / n) ** 2, 0);
const sigma2 = sse / (n - k), r2 = 1 - sse / sst;
console.log("R-squared:", r2.toFixed(3), "| residual spread ~", (Math.sqrt(sigma2) * 100).toFixed(0) + "%");
const out = names.map((nm, j) => ({ driver: nm, effect_pct: ((Math.exp(beta[j]) - 1) * 100).toFixed(1), se_pct: (Math.sqrt(Inv[j][j] * sigma2) * 100).toFixed(1) })).slice(1);
console.table(out);

// median price by layout, pooled and Docklands
const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const lay = {};
for (const r of rows) { const key = `${r.bed}b ${r.bath >= 2 ? "2+" : 1}ba ${r.park ? "car" : "no car"}`; (lay[key] ??= []).push(r.p); }
console.table(Object.fromEntries(Object.entries(lay).filter(([, v]) => v.length >= 8).sort().map(([k2, v]) => [k2, { n: v.length, median: Math.round(med(v)) }])));
writeFileSync("data/price_drivers.json", JSON.stringify({ n, r2, effects: out, layouts: Object.fromEntries(Object.entries(lay).map(([k2, v]) => [k2, { n: v.length, median: med(v) }])) }, null, 1));
