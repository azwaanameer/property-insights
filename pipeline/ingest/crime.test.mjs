import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations } from "../../db/migrate.mjs";
import { openPglite } from "../lib/db.mjs";
import { PublishCheckError } from "../publish/publish.mjs";
import { CrimeDataError, LICENCE_SENTENCE, buildCrimeRows, readExtract, runCrime } from "./crime.mjs";
import { CRIME_AS_OF, CRIME_EXPECT, CRIME_OPTIONS, crimeFixtureDir } from "./fixtures/crime.mjs";

// The committed workbook is a real excerpt of the Crime Statistics Agency file (see fixtures/crime.mjs): four councils for five years and
// eight suburbs. Everything runs through the real python extractor and the real loader into in-process PGlite.

let dir;
let fx;
beforeAll(async () => {
  dir = await crimeFixtureDir();
  fx = await readExtract(dir);
});

let db;
let close;
beforeEach(async () => {
  ({ db, close } = await openPglite());
  await applyMigrations(db);
});
afterEach(() => close());

const clone = () => structuredClone(fx);
const pointer = async () => (await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_current WHERE source_id = 'csa_crime_incidents'"))[0]?.id ?? null;
const count = async (table, id) => (await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE dataset_version_id = $1`, [id]))[0].n;

describe("crime-extract.py on the committed excerpt", () => {
  it("reads Table 01 including the region Total rows, Table 03 added up to subdivision, and the control totals of the raw rows", () => {
    expect(fx.manifest).toMatchObject({ source: "csa_crime_incidents", as_of: CRIME_AS_OF, years: [2022, 2023, 2024, 2025, 2026], table03_source_rows: 1637, row_count: 637, lga_source_rows: 50, lga_row_count: 30 });
    // Council names lose the CSA's leading space; the Total rows are flagged, not dropped here.
    expect(fx.lga.filter((r) => r.year === 2026 && !r.is_total).map((r) => r.lga).sort()).toEqual(["Casey", "Justice Institutions and Immigration Facilities", "Melbourne", "Port Phillip", "Stonnington", "Unincorporated Vic"]);
    expect(fx.lga.filter((r) => r.year === 2026 && r.is_total)).toHaveLength(4);
    expect(fx.lga.find((r) => r.year === 2026 && r.lga === "Melbourne")).toMatchObject({ incidents: 33128, rate_per_100k: 16944.407485256, police_region: "1 North West Metro" });
    expect(fx.lga.find((r) => r.lga === "Unincorporated Vic" && !r.is_total).rate_per_100k).toBeNull();
    // The control total is the sum of the raw rows, before the subgroup rows were added up.
    const loadedSum = fx.suburb.filter((r) => r[0] === 2026).reduce((n, r) => n + r[6], 0);
    expect(loadedSum).toBe(fx.manifest.table03_totals["2026"]);
  });

  it("stores the workbook's own notices as published, including the licence line and the small-count notice", () => {
    const text = fx.notes.map((n) => n.text);
    expect(text).toContain("In order to maintain confidentiality, sensitive offence counts for subdivisions 'A10 Homicide and related offences' and 'A30 Sexual offences' with a value of 3 or less are given a value of 2 to calculate totals.");
    expect(text.some((t) => t.includes("Victoria in Futures"))).toBe(true);
    expect(text.some((t) => t.includes("When reporting this data you must attribute the Crime Statistics Agency"))).toBe(true);
    expect(text.some((t) => t.includes("Other crimes against the person includes A10 Homicide"))).toBe(true);
    // The en dash survives (the file is UTF-8 end to end).
    expect(text.some((t) => t.startsWith("Criminal incidents – Excludes"))).toBe(true);
  });
});

describe("runCrime on the excerpt", () => {
  it("publishes one dataset version with the council rows (Totals left out), the suburb rows and the notices", async () => {
    const out = await runCrime(db, { dir, ...CRIME_OPTIONS });
    expect(await pointer()).toBe(out.dataset_version_id);
    expect(out).toMatchObject({ rows: 637 + 30, suburb_rows: 637, lga_rows: 30, notices: 14, as_of: CRIME_AS_OF, lga_rows_per_year: 6 });
    const id = out.dataset_version_id;
    expect(await count("fact_crime_suburb", id)).toBe(637);
    expect(await count("fact_crime_lga", id)).toBe(30);
    expect(await count("fact_crime_note", id)).toBe(14);
    // A region "Total" row stored next to its members would count every incident twice.
    expect((await db.query("SELECT count(*)::int AS n FROM fact_crime_lga WHERE lga = 'Total'"))[0].n).toBe(0);
    const [v] = await db.query("SELECT status, row_count::int AS n, licence_snapshot, to_char(as_of, 'YYYY-MM-DD') AS as_of FROM src_dataset_version WHERE dataset_version_id = $1", [id]);
    expect(v).toEqual({ status: "published", n: 667, licence_snapshot: "CC BY 4.0", as_of: CRIME_AS_OF });
  });

  it("matches on a normalised, lower-case suburb key and a four-digit postcode text, and keeps a suburb in two councils as two rows", async () => {
    await runCrime(db, { dir, ...CRIME_OPTIONS });
    const rows = await db.query("SELECT DISTINCT lga FROM fact_crime_suburb WHERE suburb_key = 'melbourne' AND postcode = '3004' ORDER BY lga");
    expect(rows.map((r) => r.lga)).toEqual(["Melbourne", "Port Phillip"]);
    const [d] = await db.query("SELECT sum(incidents)::int AS n FROM fact_crime_suburb WHERE suburb_key = 'docklands' AND postcode = '3008' AND year_ending = 2026");
    expect(d.n).toBe(3058);
    // The real file's totals: Table 03 for these rows equals the extractor's control total for each year.
    for (const [y, total] of Object.entries(fx.manifest.table03_totals)) {
      const [s] = await db.query("SELECT sum(incidents)::int AS n FROM fact_crime_suburb WHERE year_ending = $1", [Number(y)]);
      expect(s.n, y).toBe(total);
    }
  });

  it("a second load of the same file replaces the first only when its checks pass; the old data stays live when one fails", async () => {
    const first = await runCrime(db, { dir, ...CRIME_OPTIONS });
    const tampered = clone();
    // Control total 5% off: the loaded rows no longer agree with what the extractor counted.
    tampered.manifest.table03_totals["2026"] = Math.round(tampered.manifest.table03_totals["2026"] * 1.05);
    await expect(runCrime(db, { extract: tampered, ...CRIME_OPTIONS })).rejects.toBeInstanceOf(PublishCheckError);
    await expect(runCrime(db, { extract: tampered, ...CRIME_OPTIONS })).rejects.toThrow(/control total by more than 1%/);
    expect(await pointer()).toBe(first.dataset_version_id);
    // The failed versions are marked failed and leave no rows behind.
    const failed = await db.query("SELECT dataset_version_id::text AS id FROM src_dataset_version WHERE status = 'failed'");
    expect(failed.length).toBe(2);
    for (const f of failed) {
      expect(await count("fact_crime_suburb", f.id)).toBe(0);
      expect(await count("fact_crime_lga", f.id)).toBe(0);
      expect(await count("fact_crime_note", f.id)).toBe(0);
    }
    expect(await count("fact_crime_suburb", first.dataset_version_id)).toBe(637);
  });

  it("the control total check fails beyond 1% and passes within it", async () => {
    const short = clone();
    short.manifest.table03_totals["2026"] += 200; // the extractor 'counted' 200 more than were loaded: about 2%
    await expect(runCrime(db, { extract: short, ...CRIME_OPTIONS })).rejects.toThrow(/control total by more than 1%/);
    const small = clone();
    small.manifest.table03_totals["2026"] += 50; // about 0.5%: inside the tolerance
    await expect(runCrime(db, { extract: small, ...CRIME_OPTIONS })).resolves.toMatchObject({ source_id: "csa_crime_incidents" });
  });

  it("the suburb counts are compared with the council area counts: an excerpt of a few suburbs fails at the default tolerance", async () => {
    await expect(runCrime(db, { dir, expect: CRIME_EXPECT, minimum: 10 })).rejects.toThrow(/council area counts by more than 1%/);
    expect(await pointer()).toBeNull();
  });

  it("refuses a new version much smaller than the current one", async () => {
    await runCrime(db, { dir, ...CRIME_OPTIONS });
    const small = clone();
    small.suburb = small.suburb.filter((r) => r[0] >= 2025);
    small.manifest.row_count = small.suburb.length;
    small.manifest.table03_totals = Object.fromEntries(Object.entries(small.manifest.table03_totals).filter(([y]) => Number(y) >= 2025));
    small.lga = small.lga.filter((r) => r.year >= 2025);
    small.manifest.lga_source_rows = small.lga.length;
    await expect(runCrime(db, { extract: small, expect: { lgaRowsPerYear: 10, years: 2 }, minimum: 10, councilTolerance: 1 })).rejects.toThrow(/below 80% of the current version/);
  });
});

describe("buildCrimeRows refuses an unusable extract and creates nothing", () => {
  const problems = (extract, expect_ = CRIME_EXPECT) => {
    try {
      buildCrimeRows(extract, expect_);
    } catch (err) {
      expect(err).toBeInstanceOf(CrimeDataError);
      return err.problems.join(" | ");
    }
    throw new Error("expected a CrimeDataError");
  };

  it("passes the committed excerpt, and counts 87 rows a year only when told to", () => {
    expect(() => buildCrimeRows(fx, CRIME_EXPECT)).not.toThrow();
    expect(problems(fx, { lgaRowsPerYear: 87, years: 5 })).toMatch(/has 10 rows for year ending June 2026, expected 87/);
    expect(problems(fx, { lgaRowsPerYear: 10, years: 10 })).toMatch(/covers 5 years, expected 10/);
  });

  it("a region Total that does not equal its rows fails", () => {
    const bad = clone();
    bad.lga.find((r) => r.is_total && r.year === 2026 && r.police_region === "1 North West Metro").incidents += 1;
    expect(problems(bad)).toMatch(/1 North West Metro Total for 2026 is 33129 but its rows add to 33128/);
  });

  it("a council area in Table 03 that is not in Table 01 fails", () => {
    const bad = clone();
    bad.suburb.push([2026, "Nowhere Shire", "3999", "Fakeville", "A Crimes against the person", "A20 Assault and related offences", 1]);
    expect(problems(bad)).toMatch(/council areas that Table 01 does not: Nowhere Shire/);
  });

  it("a negative count or a bad postcode fails the schema", () => {
    const neg = clone();
    neg.suburb[0][6] = -1;
    expect(problems(neg)).toMatch(/incidents/);
    const pc = clone();
    pc.suburb[0][2] = "30";
    expect(problems(pc)).toMatch(/postcode/);
    const neglga = clone();
    neglga.lga[0].incidents = -5;
    expect(problems(neglga)).toMatch(/incidents/);
  });

  it("a workbook that no longer states its licence is refused, because the source is cleared on that sentence", () => {
    const bad = clone();
    bad.notes = bad.notes.filter((n) => !n.text.includes(LICENCE_SENTENCE));
    expect(problems(bad)).toMatch(/do not state the licence/);
  });

  it("loadCrime writes nothing when the extract is unusable (no dataset version is created)", async () => {
    const bad = clone();
    bad.notes = [];
    await expect(runCrime(db, { extract: bad, ...CRIME_OPTIONS })).rejects.toBeInstanceOf(CrimeDataError);
    expect((await db.query("SELECT count(*)::int AS n FROM src_dataset_version WHERE source_id = 'csa_crime_incidents'"))[0].n).toBe(0);
  });
});

describe("readExtract", () => {
  it("refuses a manifest that disagrees with the suburb file (a cut-short or stale extract)", async () => {
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const os = await import("node:os");
    const tmp = await mkdtemp(path.join(os.tmpdir(), "crime-stale-"));
    for (const f of ["lga.json", "suburb.json", "notes.json"]) await writeFile(path.join(tmp, f), await readFile(path.join(dir, f)));
    await writeFile(path.join(tmp, "manifest.json"), JSON.stringify({ ...fx.manifest, row_count: fx.manifest.row_count + 1 }));
    await expect(readExtract(tmp)).rejects.toThrow(/run the extract again/);
  });
});
