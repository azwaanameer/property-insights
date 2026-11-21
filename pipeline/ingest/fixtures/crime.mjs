// A real excerpt of the Crime Statistics Agency workbook (crime-excerpt.xlsx), for tests. Built from data/raw/vic/crime on 2026-11-21:
//   Contents and Footnotes copied as published; Table 01 for the councils Melbourne, Port Phillip, Stonnington and Casey plus the two
//   non-council rows, years ending June 2022 to 2026, with the police-region "Total" rows' incidents recomputed for those councils (the
//   rates on those rows are the real ones); Table 03 for Docklands 3008, Melbourne 3004 (two councils), South Yarra 3141 (two councils),
//   Cranbourne North 3977, Windsor 3004 (listed 2022 to 2025 but not 2026) and Lysterfield South 3156.
// The excerpt holds a handful of suburbs, so Table 03 sums to far less than Table 01: tests use CRIME_OPTIONS, which turns the council comparison
// off, and the cross-table check is tested separately with crafted data.
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExtractor } from "../crime.mjs";

export const CRIME_FIXTURE_XLSX = path.join(path.dirname(fileURLToPath(import.meta.url)), "crime", "crime-excerpt.xlsx");
export const CRIME_AS_OF = "2026-11-21";
/** Table 01 of the excerpt has 10 rows a year (4 councils, 2 non-council rows, 4 Totals) for 5 years. */
export const CRIME_EXPECT = { lgaRowsPerYear: 10, years: 5 };
/** councilTolerance 1 switches off the suburb-against-council comparison (the excerpt is a few suburbs of whole councils); the 1% control total check stays on. */
export const CRIME_OPTIONS = { expect: CRIME_EXPECT, minimum: 10, councilTolerance: 1 };

let extracted;
/** The fixture workbook extracted once per test file (it runs python); resolves to the directory holding the four JSON files. */
export const crimeFixtureDir = () =>
  (extracted ??= (async () => {
    const out = await mkdtemp(path.join(os.tmpdir(), "crime-fixture-"));
    runExtractor({ input: CRIME_FIXTURE_XLSX, out, as_of: CRIME_AS_OF });
    return out;
  })());
