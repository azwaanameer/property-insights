import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
for (const t of ["market_buildings","building_flags","building_addresses","airdna_estimates","airdna_market_listings","property_listing_details","property_estimates"]) {
  const c = await sql.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position", [t]);
  const n = await sql.query(`select count(*)::int n from ${t}`);
  console.log(t, n[0].n, "|", c.map(x=>x.column_name).join(","));
}
