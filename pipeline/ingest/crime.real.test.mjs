// End to end on the REAL Crime Statistics Agency workbook in data/raw/vic/crime, through the real python extractor and the real loader with its
// DEFAULT thresholds, into in-process PGlite. Skipped when data/raw is absent (it is gitignored). The extract takes about twenty seconds.
// Documented counts (workbook saved 2026-11-21): Table 01 870 rows (87 a year for 10 years, years ending June 2017 to 2026); Table 03
// 341,869 rows, 181,147 once added up to offence subdivision; 14 notices.
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { DEFAULT_XLSX, readExtract, runCrime, runExtractor } from "./crime.mjs";

const have = existsSync(DEFAULT_XLSX);

describe.skipIf(!have)("real Crime Statistics Agency workbook into PGlite", () => {
  let db;
  let close;
  let out;
  let extract;
  beforeAll(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "crime-real-"));
    runExtractor({ out: dir });
    extract = await readExtract(dir);
    ({ db, close } = await openPglite());
    await applyMigrations(db);
    out = await runCrime(db, { dir });
  }, 300_000);
  afterAll(() => close?.());

  it("publishes with the documented counts and every default check passing (87 council rows a year for 10 years, totals within 1%)", () => {
    expect(extract.manifest).toMatchObject({ lga_source_rows: 870, table03_source_rows: 341869, row_count: 181147, years: [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026] });
    expect(out).toMatchObject({ suburb_rows: 181147, lga_rows: 810, notices: 14, rows: 181957 });
  });

  it("Table 01 and Table 03 count the same incidents: the suburb rows add to the council rows, year by year", async () => {
    const rows = await db.query(
      `SELECT l.year_ending, l.total::int AS lga, (SELECT sum(incidents)::int FROM fact_crime_suburb s WHERE s.year_ending = l.year_ending) AS suburb
       FROM (SELECT year_ending, sum(incidents) AS total FROM fact_crime_lga WHERE rate_per_100k IS NOT NULL GROUP BY year_ending) l ORDER BY 1`,
    );
    expect(rows).toHaveLength(10);
    for (const r of rows) expect(r.suburb, String(r.year_ending)).toBe(r.lga);
  });

  it("Docklands 3008 in the City of Melbourne for the year ending June 2026, as read from the file", async () => {
    const [d] = await db.query("SELECT sum(incidents)::int AS n, count(DISTINCT lga)::int AS councils FROM fact_crime_suburb WHERE suburb_key = 'docklands' AND postcode = '3008' AND year_ending = 2026");
    expect(d).toEqual({ n: 3058, councils: 1 });
    const [m] = await db.query("SELECT incidents, rate_per_100k FROM fact_crime_lga WHERE lga = 'Melbourne' AND year_ending = 2026");
    expect(m).toEqual({ incidents: 33128, rate_per_100k: 16944.407485256 });
  });

  it("the state rate worked out from the council rows is a plausible rate for every 100,000 residents, and the region Totals are not stored", async () => {
    const [s] = await db.query(
      `SELECT sum(incidents)::float8 / sum(incidents * 100000.0 / rate_per_100k) * 100000 AS rate, count(*)::int AS areas
       FROM fact_crime_lga WHERE year_ending = 2026 AND rate_per_100k > 0`,
    );
    expect(s.areas).toBe(79);
    // The 2026 incidents in the council rows: a stored or summed region Total would double this.
    expect((await db.query("SELECT sum(incidents)::int AS n FROM fact_crime_lga WHERE year_ending = 2026 AND rate_per_100k > 0"))[0].n).toBe(465_100);
    expect(s.rate).toBeGreaterThan(5_000);
    expect(s.rate).toBeLessThan(9_000);
    expect((await db.query("SELECT count(*)::int AS n FROM fact_crime_lga WHERE lga = 'Total'"))[0].n).toBe(0);
  });

  it("the small-count notice is stored as the workbook words it", async () => {
    const rows = await db.query("SELECT note_text FROM fact_crime_note WHERE note_text LIKE '%value of 3 or less are given a value of 2%'");
    expect(rows).toHaveLength(1);
    expect(rows[0].note_text).toContain("'A10 Homicide and related offences' and 'A30 Sexual offences'");
  });
});
