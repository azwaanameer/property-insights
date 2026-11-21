// Test fixtures for the City of Melbourne loader: rows copied from the real files (data/raw/vic/city-of-melbourne) around the Docklands
// test address. Buildings: every current building within 450 m (census 2023 and 2024), the two "646-666 Flinders Street" records (one last
// seen in 2020, so no longer current) and all years of record 559277. One row is moved: record 559277, the real "614-644 Flinders Street
// DOCKLANDS" tower (45 floors above ground, built 2018), has its address and position set to the synthetic G-NAF fixture address
// "628 Flinders Street, Docklands" so the loader's match can be tested end to end. Its other facts are the real ones.
// Dwellings: the same properties, 2023 and 2024. Monitor: every development within 1.1 km.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "com");
const read = (f) => readFileSync(path.join(dir, f), "utf8");

export const COM_TEXTS = { buildings: read("buildings.csv"), dwellings: read("dwellings.csv"), monitor: read("monitor.csv") };
export const COM_AS_OF = "2026-11-14";
/** The real record whose address and position were moved onto the fixture address. */
export const COM_TOWER = "559277";
/** The fixture address the supply and building layers are tested from (the synthetic G-NAF "628 Flinders Street, Docklands"). */
export const FIXTURE_POINT = { lat: -37.823, lon: 144.949 };
