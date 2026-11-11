// RapidAPI realty-in-au client with disk cache (each cache miss costs 1 of the free 500/month).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const H = "realty-in-au.p.rapidapi.com";
export async function rp(path, params = {}) {
  const q = new URLSearchParams(params).toString(); const url = `https://${H}${path}?${q}`;
  const f = `data/raw/rp/${createHash("md5").update(url).digest("hex")}.json`;
  mkdirSync("data/raw/rp", { recursive: true });
  if (existsSync(f)) return { ...JSON.parse(readFileSync(f, "utf8")), cached: true };
  const r = await fetch(url, { headers: { "x-rapidapi-key": process.env.RAPIDAPI_KEY, "x-rapidapi-host": H } });
  const out = { url: url.replace(H, "H"), status: r.status, remaining: r.headers.get("x-ratelimit-requests-remaining"), body: await r.json().catch(() => null) };
  if (r.ok) writeFileSync(f, JSON.stringify(out));
  return out;
}
