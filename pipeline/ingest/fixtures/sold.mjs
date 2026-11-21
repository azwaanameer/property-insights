// Test fixtures for the reported-sales loader and the price-driver model: excerpts of the real harvest files (data/rp_harvest.json and
// data/rp_sold_harvest.json), keeping the listing fields as they are. 270 sales from rp_harvest.json (all 150 Docklands, 90 Melbourne CBD and
// 30 St Kilda sales, 11 of them at 628 Flinders Street, the building of the Docklands test address) and 103 from rp_sold_harvest.json (South
// Melbourne, with the streets Cobden, Moray and Park, plus Carlton, which has no rows, as in the real file). The real files also carry agent,
// agency and phone fields: here those hold placeholders ("Fixture Agent", "0400000000"), so a test can prove the loader never copies them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SOLD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "sold");
export const SOLD_FILES = { harvest: path.join(SOLD_DIR, "rp_harvest.json"), sold: path.join(SOLD_DIR, "rp_sold_harvest.json") };
export const SOLD_TEXTS = { harvest: readFileSync(SOLD_FILES.harvest, "utf8"), sold: readFileSync(SOLD_FILES.sold, "utf8") };
/** The harvest date: the `retrieved` date of the sold file. */
export const SOLD_AS_OF = "2026-11-21";
/** The checks scaled to the excerpt: 373 sales in 4 suburbs. */
export const SOLD_OPTIONS = { minimum: 100, minimumSuburbs: 3 };
/** The model scaled to the excerpt: a suburb needs 10 usable sales (not 20), and at least 50 sales must be used. Layout cells keep the real threshold of 20. */
export const DRIVER_OPTIONS = { minSuburb: 10, minLayout: 20, minimumDrivers: 5, minimumUsed: 50 };
/** The six numbers the loader and the model are expected to give on the excerpt (checked in rp-sold.test.mjs; the fixture is fixed). */
export const SOLD_COUNTS = { rows: 373 };

/** A fresh copy of the two files' parsed contents, for a test that changes them. */
export const soldClone = () => ({ harvest: JSON.parse(SOLD_TEXTS.harvest), sold: JSON.parse(SOLD_TEXTS.sold) });
/** Parsed contents back to the text the loader reads. */
export const soldTexts = ({ harvest, sold }) => ({ harvest: JSON.stringify(harvest), sold: JSON.stringify(sold) });
