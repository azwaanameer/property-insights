import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
console.log(await sql`select count(*)::int total, count(*) filter (where archived_at is null)::int active, count(distinct suburb)::int suburbs from properties`);
console.log(await sql`select state, count(*)::int n from properties group by 1 order by 2 desc`);
console.log(await sql`select suburb, count(*)::int n from properties group by 1 order by 2 desc limit 15`);
console.log(await sql`select property_type, count(*)::int n from properties group by 1 order by 2 desc`);
console.log(await sql`select address, suburb, postcode, property_type, bedrooms, price, monthly_rent, source from properties order by random() limit 12`);
