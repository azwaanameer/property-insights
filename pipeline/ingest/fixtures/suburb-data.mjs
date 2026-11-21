// Test fixtures for the Victorian suburb-data loaders: small excerpts of the real files (Valuer-General medians, Homes Victoria
// rents, Census 2021 tables, SEIFA 2021, G-NAF locality neighbours) for Docklands, Southbank, Melbourne, Carlton and nearby suburbs.
// excerpts.json, census.json, seifa.csv and the two PSV files hold values copied from data/raw; nothing in them is invented, except
// the synthetic rows each test names itself. The xlsx files are written on demand into a temp directory.
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_SALS } from "./sals.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "suburb-data");
const json = (f) => JSON.parse(readFileSync(path.join(dir, f), "utf8"));
const excerpts = json("excerpts.json");

export const SUBURB_DATA_DIR = dir;

/** Real Victorian suburbs (real SAL codes) plus the two ambiguous "Fakeville" rows the address fixtures use. */
export const SUBURB_DATA_SALS = [
  ...json("sals.json"),
  ...FIXTURE_SALS.filter((s) => s.name === "Fakeville"),
];

export const DOCKLANDS = "20766";
export const SOUTHBANK = "22315";
export const MELBOURNE = "21640";
export const CARLTON = "20495";

async function writeWorkbook(file, sheets) {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.utils.book_new();
  for (const [name, grid] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid), name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

/** Writes the four Valuer-General files under the names the loader expects. `edit` may change a grid before it is written. */
export async function writeVgvFixtures(outDir, edit = (_name, grid) => grid) {
  const files = {
    "units-by-suburb-2015-2025.xlsx": ["unitsAnnual", excerpts.vgv.unitsAnnual],
    "houses-by-suburb-2015-2025.xlsx": ["housesAnnual", excerpts.vgv.housesAnnual],
    "median-unit-march-quarter-2026.xls": ["unitsQ", excerpts.vgv.unitsQ],
    "median-house-march-quarter-2026.xls": ["housesQ", excerpts.vgv.housesQ],
  };
  for (const [file, [name, grid]] of Object.entries(files)) {
    await writeWorkbook(path.join(outDir, file), { Sheet1: edit(name, structuredClone(grid)) });
  }
  return outDir;
}

export async function writeRentFixture(file, edit = (_sheet, grid) => grid) {
  const sheets = Object.fromEntries(Object.entries(excerpts.rents).map(([name, grid]) => [name, edit(name, structuredClone(grid))]));
  await writeWorkbook(file, sheets);
  return file;
}

export const rentGrid = (sheet) => structuredClone(excerpts.rents[sheet]);
export const vgvGrid = (name) => structuredClone(excerpts.vgv[name]);

export const CENSUS_TEXTS = json("census.json");
export const SEIFA_FILE = path.join(dir, "seifa.csv");
export const NEIGHBOUR_TEXTS = {
  localityText: readFileSync(path.join(dir, "VIC_LOCALITY_psv.psv"), "utf8"),
  neighbourText: readFileSync(path.join(dir, "VIC_LOCALITY_NEIGHBOUR_psv.psv"), "utf8"),
};
